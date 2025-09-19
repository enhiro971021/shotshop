import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../../../../lib/firebase-admin';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const { shopId } = req.query;
  if (typeof shopId !== 'string') {
    res.status(400).json({ message: 'shopId を指定してください' });
    return;
  }

  const doc = await db.collection('shops').doc(shopId).get();
  if (!doc.exists) {
    res.status(404).json({ message: 'ショップが見つかりません' });
    return;
  }

  const data = doc.data() ?? {};
  if (data.status !== 'open') {
    res.status(403).json({ message: '現在このショップは準備中です' });
    return;
  }

  res.status(200).json({
    shop: {
      shopId: doc.id,
      name: data.name,
      purchaseMessage: data.purchaseMessage,
      status: data.status,
    },
  });
}
