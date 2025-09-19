import type { NextApiRequest, NextApiResponse } from 'next';
import type { Message, WebhookEvent } from '@line/bot-sdk';
import {
  getLineClient,
  getLineMiddleware,
  validateLineConfig,
} from '../../lib/line';
import { getOrCreateShop } from '../../lib/shops';
import {
  consumeContactPendingOrder,
  markContactPending,
  updateOrderStatus,
} from '../../lib/orders';
import {
  notifyContactConfirmation,
  notifyContactRequest,
  notifyContactSent,
  notifyOrderAccepted,
  notifyOrderCanceled,
  relayContactMessage,
} from '../../lib/notifications';

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
    const order = await consumeContactPendingOrder(ownerUserId);
    if (!order) {
      return;
    }

    const text = event.message.text?.trim();
    if (!text) {
      await replyText(
        event.replyToken,
        'メッセージが空でした。もう一度入力してください。'
      );
      return;
    }

    await relayContactMessage(order, text);
    await notifyContactSent(ownerUserId, order.id);
    await replyText(event.replyToken, '購入者へメッセージを送信しました。');
    return;
  }

  if (event.type === 'postback') {
    if (event.source.type !== 'user') {
      return;
    }

    const ownerUserId = event.source.userId;
    const params = new URLSearchParams(event.postback.data ?? '');
    const action = params.get('action');
    const orderId = params.get('orderId');

    if (!action || !orderId) {
      await replyText(event.replyToken, '操作が不正です');
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
