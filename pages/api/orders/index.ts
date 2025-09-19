import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../lib/firebase-admin';
import { authAndGetShopId } from '../../../lib/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.status(405).end('Method Not Allowed');
    return;
  }

  const debug = req.query.debug === '1';

  try {
    const { shopId } = await authAndGetShopId(req.headers.authorization);

    let query = db.collection('orders').where('shopId', '==', shopId);

    const status = req.query.status;
    if (typeof status === 'string' && status.length > 0) {
      query = query.where('status', '==', status);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.limit(100).get();
    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    res.status(200).json({ items });
  } catch (error) {
    const err = error as Error;
    const body: Record<string, unknown> = {
      error: err.message ?? String(error),
    };

    if (debug && typeof err.stack === 'string') {
      body.debug = err.stack;
    }

    res.status(401).json(body);
  }
}
