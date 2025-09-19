import type { NextApiRequest, NextApiResponse } from 'next';
import { FieldValue } from 'firebase-admin/firestore';
import { authAndGetShopId } from '../../../../lib/auth';
import { db } from '../../../../lib/firebase-admin';

const ALLOWED_ACTIONS = ['accept', 'cancel'] as const;

type Action = (typeof ALLOWED_ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return ALLOWED_ACTIONS.includes(value as Action);
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { orderId } = req.query;

  if (typeof orderId !== 'string') {
    res.status(400).json({ message: 'orderId が不正です' });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const action = req.body?.action;
  if (!isAction(action)) {
    res.status(400).json({ message: 'action は accept か cancel を指定してください' });
    return;
  }

  const debug = req.query.debug === '1';

  try {
    const { shopId } = await authAndGetShopId(req.headers.authorization);
    const orderRef = db.collection('orders').doc(orderId);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);

      if (!snapshot.exists) {
        throw new ApiError(404, '注文が見つかりません');
      }

      const data = snapshot.data() ?? {};

      if (data.shopId !== shopId) {
        throw new ApiError(403, 'この注文にアクセスできません');
      }

      if (data.status !== 'pending') {
        throw new ApiError(400, 'pending の注文のみ操作できます');
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

    const updated = await orderRef.get();
    res.status(200).json({ item: { id: updated.id, ...updated.data() } });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 401;
    const err = error as Error;
    const body: Record<string, unknown> = {
      error: err.message ?? String(error),
    };

    if (debug && typeof err.stack === 'string') {
      body.debug = err.stack;
    }

    res.status(status).json(body);
  }
}
