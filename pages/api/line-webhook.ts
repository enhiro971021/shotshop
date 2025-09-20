import type { NextApiRequest, NextApiResponse } from 'next';
import type {
  FlexComponent,
  Message,
  MessageEvent,
  PostbackEvent,
  QuickReplyItem,
  WebhookEvent,
} from '@line/bot-sdk';
import {
  getLineClient,
  getLineMiddleware,
  validateLineConfig,
} from '../../lib/line';
import { db } from '../../lib/firebase-admin';
import { getOrCreateShop, getShopByPublicId } from '../../lib/shops';
import type { ShopRecord } from '../../lib/shops';
import {
  consumeContactPendingOrder,
  createPendingOrder,
  markContactPending,
  updateOrderStatus,
} from '../../lib/orders';
import {
  notifyContactConfirmation,
  notifyContactRequest,
  notifyContactSent,
  notifyOrderAccepted,
  notifyOrderCanceled,
  notifyNewOrder,
  relayContactMessage,
} from '../../lib/notifications';
import { listProducts } from '../../lib/products';
import {
  getBuyerSession,
  resetBuyerSession,
  saveBuyerSession,
} from '../../lib/buyer-sessions';

export const config = {
  api: {
    bodyParser: false,
  },
};

function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  fn: ReturnType<typeof getLineMiddleware>
) {
  return new Promise<void>((resolve, reject) => {
    fn(req as never, res as never, (result: unknown) => {
      if (result instanceof Error) {
        reject(result);
        return;
      }
      resolve();
    });
  });
}

async function replyMessages(replyToken: string, messages: Message[]) {
  await getLineClient().replyMessage(replyToken, messages);
}

async function replyText(replyToken: string, text: string) {
  await replyMessages(replyToken, [{ type: 'text', text }]);
}

async function handleEvent(event: WebhookEvent) {
  if (event.type === 'message' && event.message.type === 'text') {
    if (event.source.type !== 'user') {
      return;
    }

    const ownerUserId = event.source.userId;
    const contactOrder = await consumeContactPendingOrder(ownerUserId);
    if (contactOrder) {
      const text = event.message.text?.trim();
      if (!text) {
        await replyText(
          event.replyToken,
          'メッセージが空でした。もう一度入力してください。'
        );
        return;
      }

      await relayContactMessage(contactOrder, text);
      await notifyContactSent(ownerUserId, contactOrder.id);
      await replyText(event.replyToken, '購入者へメッセージを送信しました。');
      return;
    }

    await handleBuyerTextMessage(event);
    return;
  }

  if (event.type === 'postback') {
    if (event.source.type !== 'user') {
      return;
    }

    const ownerUserId = event.source.userId;
    const params = new URLSearchParams(event.postback.data ?? '');
    const action = params.get('action');

    if (!action) {
      await replyText(event.replyToken, '操作が不正です');
      return;
    }

    if (
      action.startsWith('buyer-select-product') ||
      action.startsWith('buyer-set-quantity') ||
      action === 'buyer-confirm-order' ||
      action === 'buyer-cancel-flow'
    ) {
      await handleBuyerPostback(event, action, params);
      return;
    }

    const orderId = params.get('orderId');
    if (!orderId) {
      await replyText(event.replyToken, '注文IDが不正です');
      return;
    }

    try {
      const shop = await getOrCreateShop(ownerUserId);

      if (action === 'accept' || action === 'cancel') {
        const updated = await updateOrderStatus(shop.shopId, orderId, action);
        if (action === 'accept') {
          await notifyOrderAccepted(updated, shop);
          await replyText(event.replyToken, '注文を確定しました。');
        } else {
          await notifyOrderCanceled(updated);
          await replyText(event.replyToken, '注文をキャンセルしました。');
        }
        return;
      }

      if (action === 'contact') {
        const order = await markContactPending(
          ownerUserId,
          shop.shopId,
          orderId
        );
        await notifyContactRequest(order);
        await notifyContactConfirmation(ownerUserId, orderId);
        await replyText(
          event.replyToken,
          '購入者に送るメッセージをこのチャットに入力してください。（1回のみ）'
        );
        return;
      }

      await replyText(event.replyToken, '未対応のアクションです');
    } catch (error) {
      await replyText(
        event.replyToken,
        `操作に失敗しました: ${(error as Error).message}`
      );
    }
  }
}

type ActiveShop = ShopRecord;

async function fetchActiveShop(shopId: string) {
  const shop = await getShopByPublicId(shopId);
  if (!shop || shop.status !== 'open') {
    return null;
  }
  return shop;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value);
}

function buildProductFlexMessage(shop: ActiveShop, products: Awaited<ReturnType<typeof listProducts>>) {
  const bubbles = products.slice(0, 10).map((product) => {
    const productId = encodeURIComponent(product.id);
    const shopId = encodeURIComponent(shop.shopId);

    const bubble: Record<string, unknown> = {
      type: 'bubble',
      hero: product.imageUrl
        ? {
            type: 'image',
            url: product.imageUrl,
            size: 'full',
            aspectRatio: '20:13',
            aspectMode: 'cover',
          }
        : undefined,
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: product.name ?? '商品名未設定',
            weight: 'bold',
            size: 'lg',
            wrap: true,
          },
          {
            type: 'text',
            text: formatCurrency(product.price ?? 0),
            color: '#4f46e5',
            weight: 'bold',
          },
          {
            type: 'text',
            text: product.description || '説明はありません',
            wrap: true,
            color: '#475569',
            size: 'sm',
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              {
                type: 'icon',
                url: 'https://cdn-icons-png.flaticon.com/512/833/833314.png',
                size: 'sm',
              },
              {
                type: 'text',
                text: `在庫 ${product.inventory ?? 0}`,
                size: 'sm',
                color: '#64748b',
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#6366f1',
            action: {
              type: 'postback',
              label: 'この商品に進む',
              data: `action=buyer-select-product&shopId=${shopId}&productId=${productId}`,
              displayText: `${product.name} を選択する`,
            },
          },
        ],
      },
    };

    if (!product.imageUrl) {
      delete bubble.hero;
    }

    return bubble;
  });

  return {
    type: 'flex',
    altText: `${shop.name}の商品を選択してください`,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  } as Message;
}

function buildQuantityPromptMessage(
  shop: ActiveShop,
  product: Awaited<ReturnType<typeof listProducts>>[number]
) {
  const quickReplyItems: QuickReplyItem[] = [];

  for (const num of [1, 2, 3, 4, 5]) {
    quickReplyItems.push({
      type: 'action',
      action: {
        type: 'postback',
        label: `${num}`,
        data: `action=buyer-set-quantity&quantity=${num}&productId=${encodeURIComponent(
          product.id
        )}&shopId=${encodeURIComponent(shop.shopId)}`,
        displayText: `${product.name} を ${num}個で注文`,
      },
    });
  }

  quickReplyItems.push({
    type: 'action',
    action: {
      type: 'message',
      label: 'その他の数量',
      text: '数量を入力',
    },
  });

  return {
    type: 'text',
    text: `${product.name} の数量を教えてください。`,
    quickReply: {
      items: quickReplyItems,
    },
  } satisfies Message;
}

function buildConfirmationMessage(
  shop: ActiveShop,
  product: Awaited<ReturnType<typeof listProducts>>[number],
  quantity: number,
  questionResponse?: string | null
) {
  const total = (product.price ?? 0) * quantity;
  const data = `action=buyer-confirm-order&productId=${encodeURIComponent(
    product.id
  )}&shopId=${encodeURIComponent(shop.shopId)}`;

  const questionComponents: FlexComponent[] = [];
  if (questionResponse) {
    questionComponents.push({
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '質問回答', color: '#94a3b8', size: 'sm' },
        {
          type: 'text',
          text: questionResponse,
          wrap: true,
          color: '#0f172a',
          size: 'sm',
        },
      ],
    });
  }

  return {
    type: 'flex',
    altText: '注文内容を確認してください',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '注文内容の確認',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: product.name ?? '商品名未設定',
            wrap: true,
          },
         {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  { type: 'text', text: '数量', color: '#94a3b8', size: 'sm' },
                  {
                    type: 'text',
                    text: `${quantity}個`,
                    size: 'sm',
                    color: '#0f172a',
                    margin: 'md',
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  { type: 'text', text: '合計', color: '#94a3b8', size: 'sm' },
                  {
                    type: 'text',
                    text: formatCurrency(total),
                    size: 'md',
                    color: '#4f46e5',
                    weight: 'bold',
                    margin: 'md',
                  },
                ],
              },
              ...questionComponents,
            ],
          },
          {
            type: 'text',
            text: '「注文確定」を押すと、出店者へ通知されます。',
            wrap: true,
            color: '#64748b',
            size: 'sm',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#6366f1',
            action: {
              type: 'postback',
              label: '注文確定',
              data,
              displayText: '注文を確定する',
            },
          },
          {
            type: 'button',
            style: 'secondary',
            color: '#64748b',
            action: {
              type: 'postback',
              label: 'やり直す',
              data: 'action=buyer-cancel-flow',
              displayText: '注文をキャンセルする',
            },
          },
        ],
      },
    },
  } satisfies Message;
}

async function handleBuyerTextMessage(event: MessageEvent) {
  const buyerUserId = event.source.userId;
  if (!buyerUserId) {
    await replyText(event.replyToken, 'ユーザー情報を取得できませんでした。');
    return;
  }
  const text = event.message.type === 'text' ? event.message.text?.trim() : '';

  if (!text) {
    await replyText(event.replyToken, '文字を入力してください。');
    return;
  }

  if (['リセット', 'キャンセル', '中止'].includes(text)) {
    await resetBuyerSession(buyerUserId);
    await replyText(event.replyToken, '操作をキャンセルしました。ショップIDを入力してください。');
    return;
  }

  const session = await getBuyerSession(buyerUserId);

  if (session.state === 'idle' || session.state === 'choosingProduct') {
    await startShopSelection(buyerUserId, text, event.replyToken);
    return;
  }

  if (session.state === 'choosingQuantity') {
    const qty = Number(text);
    if (!Number.isInteger(qty) || qty <= 0) {
      await replyText(event.replyToken, '数量は1以上の整数で入力してください。');
      return;
    }
    await handleQuantitySelection(buyerUserId, session, qty, event.replyToken);
    return;
  }

  if (session.state === 'answeringQuestion') {
    await saveBuyerSession(buyerUserId, {
      buyerUserId,
      state: 'confirming',
      shopId: session.shopId,
      productId: session.productId,
      quantity: session.quantity,
      questionResponse: text,
    });

    const shop = session.shopId ? await fetchActiveShop(session.shopId) : null;
    if (!shop || !session.productId || !session.quantity) {
      await replyText(event.replyToken, 'セッション情報が不正です。最初からやり直してください。');
      await resetBuyerSession(buyerUserId);
      return;
    }

    const productList = await listProducts(shop.shopId);
    const product = productList.find((item) => item.id === session.productId);
    if (!product) {
      await replyText(event.replyToken, '商品が見つかりませんでした。最初からやり直してください。');
      await resetBuyerSession(buyerUserId);
      return;
    }

    await replyMessages(event.replyToken, [
      buildConfirmationMessage(shop, product, session.quantity, text),
    ]);
    return;
  }

  if (session.state === 'confirming') {
    await replyText(event.replyToken, '「注文確定」ボタンから確定してください。');
    return;
  }

  await replyText(event.replyToken, 'ショップIDを入力してください。');
}

async function startShopSelection(
  buyerUserId: string,
  shopIdInput: string,
  replyToken: string
) {
  const shopId = shopIdInput.trim();
  const shop = await fetchActiveShop(shopId);
  if (!shop) {
    await replyText(replyToken, 'ショップが見つからないか、現在は公開されていません。');
    return;
  }

  const products = await listProducts(shop.shopId);
  if (products.length === 0) {
    await replyText(replyToken, '現在、購入可能な商品がありません。');
    return;
  }

  await saveBuyerSession(buyerUserId, {
    buyerUserId,
    state: 'choosingProduct',
    shopId: shop.shopId,
  });

  const flexMessage = buildProductFlexMessage(shop, products);
  await replyMessages(replyToken, [
    flexMessage,
    {
      type: 'text',
      text: '購入したい商品を選択してください。',
    },
  ]);
}

async function handleQuantitySelection(
  buyerUserId: string,
  session: Awaited<ReturnType<typeof getBuyerSession>>,
  quantity: number,
  replyToken: string
) {
  if (!session.shopId || !session.productId) {
    await replyText(replyToken, 'セッションが無効になりました。最初からやり直してください。');
    await resetBuyerSession(buyerUserId);
    return;
  }

  const shop = await fetchActiveShop(session.shopId);
  if (!shop) {
    await replyText(replyToken, 'ショップが利用できません。');
    await resetBuyerSession(buyerUserId);
    return;
  }

  const products = await listProducts(shop.shopId);
  const product = products.find((item) => item.id === session.productId);
  if (!product) {
    await replyText(replyToken, '商品が見つかりません。');
    await resetBuyerSession(buyerUserId);
    return;
  }

  if (quantity > (product.inventory ?? 0)) {
    await replyText(replyToken, `在庫が不足しています（在庫: ${product.inventory ?? 0}）。`);
    return;
  }

  if (product.questionEnabled) {
    await saveBuyerSession(buyerUserId, {
      buyerUserId,
      state: 'answeringQuestion',
      shopId: shop.shopId,
      productId: product.id,
      quantity,
    });

    await replyText(
      replyToken,
      product.questionText ? product.questionText : '購入時の質問への回答を入力してください。'
    );
    return;
  }

  await saveBuyerSession(buyerUserId, {
    buyerUserId,
    state: 'confirming',
    shopId: shop.shopId,
    productId: product.id,
    quantity,
    questionResponse: null,
  });

  await replyMessages(replyToken, [
    buildConfirmationMessage(shop, product, quantity),
  ]);
}

async function handleBuyerPostback(
  event: PostbackEvent,
  action: string,
  params: URLSearchParams
) {
  const buyerUserId = event.source.userId;
  const session = await getBuyerSession(buyerUserId);

  if (action === 'buyer-cancel-flow') {
    await resetBuyerSession(buyerUserId);
    await replyText(event.replyToken, '操作をキャンセルしました。ショップIDを入力してください。');
    return;
  }

  if (action === 'buyer-select-product') {
    const shopId = params.get('shopId') ?? session.shopId;
    const productId = params.get('productId');
    if (!shopId || !productId) {
      await replyText(event.replyToken, '商品情報が取得できませんでした。');
      return;
    }

    const shop = await fetchActiveShop(shopId);
    if (!shop) {
      await replyText(event.replyToken, 'ショップが利用できません。');
      await resetBuyerSession(buyerUserId);
      return;
    }

    const products = await listProducts(shop.shopId);
    const product = products.find((item) => item.id === productId);
    if (!product) {
      await replyText(event.replyToken, '商品が見つかりません。');
      return;
    }

    await saveBuyerSession(buyerUserId, {
      buyerUserId,
      state: 'choosingQuantity',
      shopId: shop.shopId,
      productId: product.id,
    });

    await replyMessages(event.replyToken, [
      buildQuantityPromptMessage(shop, product),
    ]);
    return;
  }

  if (action === 'buyer-set-quantity') {
    const quantity = Number(params.get('quantity'));
    if (!Number.isInteger(quantity) || quantity <= 0) {
      await replyText(event.replyToken, '数量が不正です。');
      return;
    }

    await handleQuantitySelection(
      buyerUserId,
      session,
      quantity,
      event.replyToken
    );
    return;
  }

  if (action === 'buyer-confirm-order') {
    if (!session.shopId || !session.productId || !session.quantity) {
      await replyText(event.replyToken, 'セッションが無効です。最初からやり直してください。');
      await resetBuyerSession(buyerUserId);
      return;
    }

    const shop = await getShopByPublicId(session.shopId);
    if (!shop) {
      await replyText(event.replyToken, 'ショップが見つかりません。');
      await resetBuyerSession(buyerUserId);
      return;
    }
    const products = await listProducts(session.shopId);
    const product = products.find((item) => item.id === session.productId);
    if (!product) {
      await replyText(event.replyToken, '商品が見つかりません。');
      await resetBuyerSession(buyerUserId);
      return;
    }

    try {
      const order = await createPendingOrder({
        shop,
        product,
        quantity: session.quantity,
        buyerUserId,
        questionResponse: session.questionResponse ?? null,
      });
      await notifyNewOrder(order, shop);
      await replyMessages(event.replyToken, [
        {
          type: 'text',
          text: `注文を受け付けました。\n注文ID: ${order.id}\n出店者からの連絡をお待ちください。`,
        },
        {
          type: 'text',
          text: '在庫状況によってキャンセルとなる場合があります。',
        },
      ]);
    } catch (error) {
      await replyText(
        event.replyToken,
        `注文に失敗しました: ${(error as Error).message}`
      );
    } finally {
      await resetBuyerSession(buyerUserId);
    }
    return;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,HEAD,POST,OPTIONS');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET,HEAD,POST,OPTIONS');
    res.status(405).end('Method Not Allowed');
    return;
  }

  try {
    validateLineConfig();
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
    return;
  }

  try {
    await runMiddleware(req, res, getLineMiddleware());
  } catch (error) {
    res.status(401).json({ message: (error as Error).message });
    return;
  }

  const body = (req as unknown as { body?: { events?: WebhookEvent[] } }).body;
  const events = body?.events ?? [];

  if (events.length === 0) {
    res.status(200).json({ status: 'no-events' });
    return;
  }

  await Promise.all(events.map((event) => handleEvent(event)));

  res.status(200).json({ status: 'handled' });
}
