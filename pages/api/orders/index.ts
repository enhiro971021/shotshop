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
    res
      .status(401)
      .json({ error: (error as Error).message ?? String(error) });
  }
}
