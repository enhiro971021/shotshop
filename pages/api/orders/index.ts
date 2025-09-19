import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticateRequest, UnauthorizedError } from '../../../lib/line-auth';
import { getFirestore } from '../../../lib/firebase-admin';
import { getShop } from '../../../lib/shops';

export type OrderStatus = 'pending' | 'accepted' | 'canceled';

export type OrderSummary = {
  id: string;
  createdAt: string | null;
  buyerDisplayId: string;
  status: OrderStatus;
  total: number;
  items: Array<{
    productId?: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  questionResponse?: string | null;
  memo?: string | null;
  closed?: boolean;
};

export type OrderListResponse = {
  orders: OrderSummary[];
};

export type ErrorResponse = {
  message: string;
};

function mapOrder(doc: FirebaseFirestore.QueryDocumentSnapshot): OrderSummary {
  const data = doc.data();
  const items = (Array.isArray(data.items) ? data.items : []) as OrderSummary['items'];

  const total =
    typeof data.total === 'number'
      ? data.total
      : items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

  const createdAt =
    data.createdAt && typeof data.createdAt.toDate === 'function'
      ? data.createdAt.toDate().toISOString()
      : null;

  return {
    id: doc.id,
    createdAt,
    buyerDisplayId: data.buyerDisplayId ?? 'unknown',
    status: (data.status as OrderStatus) ?? 'pending',
    total,
    items,
    questionResponse: data.questionResponse ?? null,
    memo: data.memo ?? null,
    closed: data.closed ?? false,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OrderListResponse | ErrorResponse>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  try {
    const payload = await authenticateRequest(req);
    const shop = await getShop(payload.sub);
    const db = getFirestore();
    const snapshot = await db
      .collection('orders')
      .where('shopId', '==', shop.shopId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const orders = snapshot.docs.map(mapOrder);

    res.status(200).json({ orders });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: (error as Error).message });
  }
}
