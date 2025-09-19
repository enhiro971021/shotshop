import type {
  DocumentReference,
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { db } from './firebase-admin';
import type { ShopRecord } from './shops';
import { setContactPendingOrder } from './shops';
import type { ProductRecord } from './products';

export type SerializedOrderItem = {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type SerializedOrder = {
  id: string;
  shopId: string | null;
  buyerUserId: string;
  buyerDisplayId: string;
  status: 'pending' | 'accepted' | 'canceled';
  total: number;
  createdAt: number | null;
  updatedAt: number | null;
  acceptedAt: number | null;
  canceledAt: number | null;
  items: SerializedOrderItem[];
  questionResponse?: string | null;
  memo?: string | null;
  closed?: boolean;
  contactPending?: boolean;
};

const ORDER_STATUSES = ['pending', 'accepted', 'canceled'] as const;

function makeBuyerDisplayId(buyerUserId: string) {
  const hash = createHash('sha256').update(buyerUserId).digest('hex');
  return hash.slice(0, 12);
}

function toMillis(value: unknown): number | null {
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return null;
    }
  }

  if (
    value &&
    typeof value === 'object' &&
    '_seconds' in value &&
    typeof (value as { _seconds?: unknown })._seconds === 'number'
  ) {
    const seconds = (value as { _seconds: number })._seconds;
    const nanosCandidate = value as { _nanoseconds?: unknown };
    const nanos =
      typeof nanosCandidate._nanoseconds === 'number'
        ? nanosCandidate._nanoseconds
        : 0;
    return seconds * 1000 + Math.floor(nanos / 1_000_000);
  }

  if (typeof value === 'number') {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return null;
}

function normalizeItem(
  raw: unknown,
  index: number
): SerializedOrderItem {
  if (!raw || typeof raw !== 'object') {
    return {
      name: `商品${index + 1}`,
      quantity: 0,
      unitPrice: 0,
    };
  }

  const productId =
    typeof (raw as { productId?: unknown }).productId === 'string'
      ? ((raw as { productId: string }).productId as string)
      : undefined;

  const name =
    typeof (raw as { name?: unknown }).name === 'string'
      ? ((raw as { name: string }).name as string)
      : `商品${index + 1}`;

  const quantityValue = (raw as { quantity?: unknown }).quantity;
  const quantity =
    typeof quantityValue === 'number'
      ? quantityValue
      : Number(quantityValue ?? 0);

  const unitPriceValue = (raw as { unitPrice?: unknown }).unitPrice;
  const unitPrice =
    typeof unitPriceValue === 'number'
      ? unitPriceValue
      : Number(unitPriceValue ?? 0);

  return {
    productId,
    name,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
  };
}

export function serializeOrderSnapshot(
  snapshot: QueryDocumentSnapshot | DocumentSnapshot
): SerializedOrder {
  const data = snapshot.data() ?? {};
  const itemsRaw = Array.isArray((data as { items?: unknown }).items)
    ? ((data as { items: unknown[] }).items as unknown[])
    : [];

  let items = itemsRaw.map((item, index) => normalizeItem(item, index));

  if (items.length === 0) {
    const singleItemCandidate = {
      productId: (data as { productId?: unknown }).productId,
      name:
        (data as { productName?: unknown }).productName ??
        (data as { product?: unknown }).product,
      quantity: (data as { quantity?: unknown }).quantity,
      qty: (data as { qty?: unknown }).qty,
      unitPrice:
        (data as { unitPrice?: unknown }).unitPrice ??
        (data as { priceTaxIncl?: unknown }).priceTaxIncl,
    };

    const qtyValue =
      typeof singleItemCandidate.quantity === 'number'
        ? singleItemCandidate.quantity
        : typeof singleItemCandidate.qty === 'number'
        ? singleItemCandidate.qty
        : Number(singleItemCandidate.quantity ?? singleItemCandidate.qty ?? 1);

    const unitPriceValue =
      typeof singleItemCandidate.unitPrice === 'number'
        ? singleItemCandidate.unitPrice
        : Number(singleItemCandidate.unitPrice ?? 0);

    if (qtyValue || unitPriceValue || singleItemCandidate.productId) {
      items = [
        {
          productId:
            typeof singleItemCandidate.productId === 'string'
              ? singleItemCandidate.productId
              : undefined,
          name:
            typeof singleItemCandidate.name === 'string'
              ? singleItemCandidate.name
              : '商品1',
          quantity: Number.isFinite(qtyValue) ? qtyValue : 1,
          unitPrice: Number.isFinite(unitPriceValue) ? unitPriceValue : 0,
        },
      ];
    }
  }

  const totalRaw = (data as { total?: unknown }).total;
  const total =
    typeof totalRaw === 'number'
      ? totalRaw
      : items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

  const statusRaw = (data as { status?: unknown }).status;
  const status = ORDER_STATUSES.includes(statusRaw as SerializedOrder['status'])
    ? (statusRaw as SerializedOrder['status'])
    : 'pending';

  const buyerDisplayId =
    typeof (data as { buyerDisplayId?: unknown }).buyerDisplayId === 'string'
      ? ((data as { buyerDisplayId: string }).buyerDisplayId as string)
      : 'unknown';

  const buyerUserId =
    typeof (data as { buyerUserId?: unknown }).buyerUserId === 'string'
      ? ((data as { buyerUserId: string }).buyerUserId as string)
      : '';

  const shopId =
    typeof (data as { shopId?: unknown }).shopId === 'string'
      ? ((data as { shopId: string }).shopId as string)
      : null;

  return {
    id: snapshot.id,
    shopId,
    buyerUserId,
    buyerDisplayId,
    status,
    total,
    createdAt: toMillis((data as { createdAt?: unknown }).createdAt),
    updatedAt: toMillis((data as { updatedAt?: unknown }).updatedAt),
    acceptedAt: toMillis((data as { acceptedAt?: unknown }).acceptedAt),
    canceledAt: toMillis((data as { canceledAt?: unknown }).canceledAt),
    items,
    questionResponse:
      typeof (data as { questionResponse?: unknown }).questionResponse ===
      'string'
        ? ((data as { questionResponse: string }).questionResponse as string)
        : typeof (data as { questionAnswer?: unknown }).questionAnswer ===
          'string'
        ? ((data as { questionAnswer: string }).questionAnswer as string)
        : (data as { questionResponse?: unknown }).questionResponse != null
        ? String((data as { questionResponse?: unknown }).questionResponse)
        : (data as { questionAnswer?: unknown }).questionAnswer != null
        ? String((data as { questionAnswer?: unknown }).questionAnswer)
        : null,
    memo:
      typeof (data as { memo?: unknown }).memo === 'string'
        ? ((data as { memo: string }).memo as string)
        : (data as { memo?: unknown }).memo != null
        ? String((data as { memo?: unknown }).memo)
        : null,
    closed: Boolean((data as { closed?: unknown }).closed),
    contactPending: Boolean((data as { contactPending?: unknown }).contactPending),
  };
}

export async function listOrdersForShop(
  shopId: string,
  {
    status,
    limit = 100,
  }: {
    status?: 'pending' | 'accepted' | 'canceled';
    limit?: number;
  } = {}
) {
  let query = db
    .collection('orders')
    .where('shopId', '==', shopId)
    .orderBy('createdAt', 'desc');

  if (status) {
    query = query.where('status', '==', status);
  }

  const snapshot = await query.limit(limit).get();
  return snapshot.docs.map((doc) => serializeOrderSnapshot(doc));
}

export async function getOrderForShop(
  shopId: string,
  orderId: string
) {
  const doc = await db.collection('orders').doc(orderId).get();
  if (!doc.exists) {
    throw new Error('注文が見つかりません');
  }
  const data = doc.data();
  if (data?.shopId !== shopId) {
    throw new Error('この注文にアクセスできません');
  }
  return serializeOrderSnapshot(doc);
}

type CreateOrderInput = {
  shop: ShopRecord;
  product: ProductRecord;
  quantity: number;
  buyerUserId: string;
  questionResponse?: string | null;
};

function startOfTodayMillis() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

async function assertDailyPurchaseLimit(buyerUserId: string) {
  const threshold = startOfTodayMillis();
  const snapshot = await db
    .collection('orders')
    .where('buyerUserId', '==', buyerUserId)
    .where('createdAt', '>=', new Date(threshold))
    .limit(11)
    .get();

  if (snapshot.docs.length >= 10) {
    throw new Error('1日の購入上限に達しました');
  }
}

export async function createPendingOrder({
  shop,
  product,
  quantity,
  buyerUserId,
  questionResponse,
}: CreateOrderInput) {
  if (shop.status !== 'open') {
    throw new Error('現在このショップは購入できません');
  }
  if (product.inventory <= 0) {
    throw new Error('在庫がありません');
  }
  if (quantity <= 0) {
    throw new Error('数量を1以上に指定してください');
  }
  if (quantity > product.inventory) {
    throw new Error('在庫数を超えています');
  }

  await assertDailyPurchaseLimit(buyerUserId);

  const now = FieldValue.serverTimestamp();
  const displayId = makeBuyerDisplayId(buyerUserId);
  const total = product.price * quantity;

  const payload = {
    shopId: shop.shopId,
    buyerUserId,
    buyerDisplayId: displayId,
    status: 'pending' as const,
    items: [
      {
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        quantity,
      },
    ],
    total,
    questionResponse: questionResponse ?? null,
    memo: '',
    closed: false,
     contactPending: false,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await db.collection('orders').add(payload);
  const created = await ref.get();
  return serializeOrderSnapshot(created);
}

type UpdateOrderAction = 'accept' | 'cancel';

export async function updateOrderStatus(
  shopId: string,
  orderId: string,
  action: UpdateOrderAction
) {
  const orderRef = db.collection('orders').doc(orderId);

  const result = await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      throw new Error('注文が見つかりません');
    }

    const order = orderSnap.data() as SerializedOrder;

    if (order.shopId !== shopId) {
      throw new Error('この注文にアクセスできません');
    }

    if (order.status !== 'pending') {
      throw new Error('pending の注文のみ操作できます');
    }

    const item = order.items?.[0];
    if (!item) {
      throw new Error('注文の商品情報が不正です');
    }

    if (!item.productId) {
      throw new Error('商品情報に productId がありません');
    }
    const productRef = db.collection('products').doc(item.productId);
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists) {
      throw new Error('関連する商品が見つかりません');
    }
    const product = productSnap.data() as ProductRecord;

    if (action === 'accept') {
      const nextInventory = product.inventory - item.quantity;
      if (nextInventory < 0) {
        throw new Error('在庫が不足しています');
      }
      tx.update(productRef, {
        inventory: nextInventory,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(orderRef, {
        status: 'accepted',
        acceptedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.update(orderRef, {
        status: 'canceled',
        canceledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      order: order,
      product,
    };
  });

  const updatedSnap = await orderRef.get();
  return serializeOrderSnapshot(updatedSnap);
}

export async function updateOrderMeta(
  shopId: string,
  orderId: string,
  meta: { memo?: string; closed?: boolean }
) {
  const orderRef = db.collection('orders').doc(orderId);
  const snapshot = await orderRef.get();

  if (!snapshot.exists) {
    throw new Error('注文が見つかりません');
  }
  const data = snapshot.data() as SerializedOrder;
  if (data.shopId !== shopId) {
    throw new Error('この注文にアクセスできません');
  }

  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (typeof meta.memo === 'string') {
    payload.memo = meta.memo.slice(0, 2000);
  }
  if (typeof meta.closed === 'boolean') {
    payload.closed = meta.closed;
  }

  await orderRef.set(payload, { merge: true });

  const updated = await orderRef.get();
  return serializeOrderSnapshot(updated);
}

export async function markContactPending(
  ownerUserId: string,
  shopId: string,
  orderId: string
) {
  const orderRef = db.collection('orders').doc(orderId);

  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(orderRef);
    if (!snapshot.exists) {
      throw new Error('注文が見つかりません');
    }
    const order = snapshot.data() as SerializedOrder;
    if (order.shopId !== shopId) {
      throw new Error('この注文にアクセスできません');
    }
    tx.update(orderRef, {
      contactPending: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await setContactPendingOrder(ownerUserId, orderId);
  const updated = await orderRef.get();
  return serializeOrderSnapshot(updated);
}

export async function consumeContactPendingOrder(ownerUserId: string) {
  const shopDoc = await db.collection('shops').doc(ownerUserId).get();
  if (!shopDoc.exists) {
    return null;
  }
  const shopData = shopDoc.data();
  const pendingOrderId = shopData?.contactPendingOrderId;
  if (!pendingOrderId) {
    return null;
  }

  const orderRef = db.collection('orders').doc(pendingOrderId);
  const snapshot = await orderRef.get();
  if (!snapshot.exists) {
    await setContactPendingOrder(ownerUserId, null);
    return null;
  }

  const orderData = snapshot.data() as SerializedOrder;
  if (orderData.shopId !== shopData?.shopId) {
    await setContactPendingOrder(ownerUserId, null);
    return null;
  }

  await db.runTransaction(async (tx) => {
    tx.update(orderRef, {
      contactPending: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await setContactPendingOrder(ownerUserId, null);
  return serializeOrderSnapshot(await orderRef.get());
}
