import type { NextApiRequest, NextApiResponse } from 'next';
import { FieldValue } from 'firebase-admin/firestore';
import { authenticateRequest, UnauthorizedError } from '../../../../lib/line-auth';
import { getFirestore } from '../../../../lib/firebase-admin';
import { getShop } from '../../../../lib/shops';
import type { OrderStatus, OrderSummary, ErrorResponse } from '../index';

const ALLOWED_ACTIONS = ['accept', 'cancel'] as const;

type Action = (typeof ALLOWED_ACTIONS)[number];

type UpdateResponse = {
  order: OrderSummary;
};

function isAction(value: unknown): value is Action {
  return ALLOWED_ACTIONS.includes(value as Action);
}

class BadRequestError extends Error {
  statusCode = 400;
}

async function toOrderSummary(
  docRef: FirebaseFirestore.DocumentReference
): Promise<OrderSummary> {
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error('注文が見つかりません');
  }

  const data = snap.data() ?? {};
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
    id: snap.id,
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
  res: NextApiResponse<UpdateResponse | ErrorResponse>
) {
  const { orderId } = req.query;

  if (typeof orderId !== 'string') {
    res.status(400).json({ message: 'orderId が不正です' });
    return;
  }

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const action = req.body?.action;
  if (!isAction(action)) {
    res.status(400).json({ message: 'action は accept か cancel を指定してください' });
    return;
  }

  try {
    const payload = await authenticateRequest(req);
    const shop = await getShop(payload.sub);
    const db = getFirestore();
    const orderRef = db.collection('orders').doc(orderId);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);

      if (!snapshot.exists) {
        throw new BadRequestError('注文が見つかりません');
      }

      const data = snapshot.data() ?? {};

      if (data.shopId !== shop.shopId) {
        throw new UnauthorizedError('この注文にアクセスできません');
      }

      if (data.status !== 'pending') {
        throw new BadRequestError('pending の注文のみ操作できます');
      }

      const updates: Partial<FirebaseFirestore.DocumentData> = {
        status: action === 'accept' ? 'accepted' : 'canceled',
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (action === 'accept') {
        updates.acceptedAt = FieldValue.serverTimestamp();
      }

      if (action === 'cancel') {
        updates.canceledAt = FieldValue.serverTimestamp();
      }

      transaction.update(orderRef, updates);
    });

    const order = await toOrderSummary(orderRef);
    res.status(200).json({ order });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({ message: error.message });
      return;
    }

    if (error instanceof BadRequestError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    res.status(500).json({ message: (error as Error).message });
  }
}
