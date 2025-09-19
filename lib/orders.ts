import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';

export type SerializedOrderItem = {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type SerializedOrder = {
  id: string;
  shopId: string | null;
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
};

const ORDER_STATUSES = ['pending', 'accepted', 'canceled'] as const;

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

  const items = itemsRaw.map((item, index) => normalizeItem(item, index));

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

  const shopId =
    typeof (data as { shopId?: unknown }).shopId === 'string'
      ? ((data as { shopId: string }).shopId as string)
      : null;

  return {
    id: snapshot.id,
    shopId,
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
        : (data as { questionResponse?: unknown }).questionResponse != null
        ? String((data as { questionResponse?: unknown }).questionResponse)
        : null,
    memo:
      typeof (data as { memo?: unknown }).memo === 'string'
        ? ((data as { memo: string }).memo as string)
        : (data as { memo?: unknown }).memo != null
        ? String((data as { memo?: unknown }).memo)
        : null,
    closed: Boolean((data as { closed?: unknown }).closed),
  };
}
