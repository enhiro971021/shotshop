import type { Message } from '@line/bot-sdk';
import { getLineClient } from './line';
import type { SerializedOrder } from './orders';
import type { ShopRecord } from './shops';

function formatItems(order: SerializedOrder) {
  return order.items
    .map(
      (item) =>
        `${item.name} × ${item.quantity}（${item.unitPrice.toLocaleString()}円）`
    )
    .join('\n');
}

function formatTotal(order: SerializedOrder) {
  return `${order.total.toLocaleString()}円`;
}

export async function notifyNewOrder(
  order: SerializedOrder,
  shop: ShopRecord
) {
  const client = getLineClient();

  const text =
    `新しい注文が入りました\n` +
    `注文ID: ${order.id}\n` +
    `購入者ID: ${order.buyerDisplayId}\n` +
    `商品:${order.items.length > 0 ? `\n${formatItems(order)}` : ' -'}\n` +
    `合計: ${formatTotal(order)}\n` +
    (order.questionResponse
      ? `質問への回答:\n${order.questionResponse}\n`
      : '');

  const messages: Message[] = [
    {
      type: 'template',
      altText: '新しい注文が届きました',
      template: {
        type: 'buttons',
        text: text.slice(0, 1200),
        actions: [
          {
            type: 'postback',
            label: '注文確定',
            data: `action=accept&orderId=${order.id}`,
            displayText: '注文を確定します',
          },
          {
            type: 'postback',
            label: 'キャンセル',
            data: `action=cancel&orderId=${order.id}`,
            displayText: '注文をキャンセルします',
          },
          {
            type: 'postback',
            label: '連絡する',
            data: `action=contact&orderId=${order.id}`,
            displayText: '購入者に連絡します',
          },
        ],
      },
    },
  ];

  await client.pushMessage(shop.ownerUserId, messages);
}

export async function notifyOrderAccepted(
  order: SerializedOrder,
  shop: ShopRecord
) {
  const client = getLineClient();
  const text =
    `注文が確定しました。\n` +
    `注文ID: ${order.id}\n` +
    `商品:${order.items.length > 0 ? `\n${formatItems(order)}` : ' -'}\n` +
    `合計: ${formatTotal(order)}\n\n` +
    `${shop.purchaseMessage}`;

  await client.pushMessage(order.buyerUserId, {
    type: 'text',
    text,
  });
}

export async function notifyOrderCanceled(order: SerializedOrder) {
  const client = getLineClient();
  await client.pushMessage(order.buyerUserId, {
    type: 'text',
    text: '出店者によってキャンセルされました。',
  });
}

export async function notifyContactRequest(order: SerializedOrder) {
  const client = getLineClient();
  await client.pushMessage(order.buyerUserId, {
    type: 'text',
    text: '出店者から連絡が届きます。こちらのチャットで返信してください。',
  });
}

export async function notifyContactConfirmation(
  ownerUserId: string,
  orderId: string
) {
  const client = getLineClient();
  await client.pushMessage(ownerUserId, {
    type: 'text',
    text: `注文ID ${orderId} の購入者へメッセージを送る準備ができました。1回だけメッセージを送信できます。`,
  });
}

export async function relayContactMessage(
  order: SerializedOrder,
  message: string
) {
  const client = getLineClient();
  await client.pushMessage(order.buyerUserId, {
    type: 'text',
    text: `出店者からメッセージが届きました。\n${message}`,
  });
}

export async function notifyContactSent(
  ownerUserId: string,
  orderId: string
) {
  const client = getLineClient();
  await client.pushMessage(ownerUserId, {
    type: 'text',
    text: `注文ID ${orderId} へのメッセージを送信しました。`,
  });
}
