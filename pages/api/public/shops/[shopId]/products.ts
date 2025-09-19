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

  const shopDoc = await db.collection('shops').doc(shopId).get();
  if (!shopDoc.exists || (shopDoc.data()?.status ?? 'preparing') !== 'open') {
    res.status(403).json({ message: '現在このショップは準備中です' });
    return;
  }

  const snapshot = await db
    .collection('products')
    .where('shopId', '==', shopId)
    .get();

  const items = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }))
    .filter((item) => item.isArchived !== true)
    .filter((item) => Number(item.inventory ?? 0) > 0)
    .map((item) => ({
      id: item.id,
      name: typeof item.name === 'string' ? item.name : '',
      description:
        typeof item.description === 'string' ? item.description : '',
      price:
        typeof item.price === 'number' ? item.price : Number(item.price ?? 0),
      inventory:
        typeof item.inventory === 'number'
          ? item.inventory
          : Number(item.inventory ?? 0),
      imageUrl:
        typeof item.imageUrl === 'string' ? item.imageUrl : undefined,
      questionEnabled: Boolean(item.questionEnabled),
      questionText:
        typeof item.questionText === 'string' ? item.questionText : '',
    }));

  res.status(200).json({ items });
}
