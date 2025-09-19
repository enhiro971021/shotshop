import type { NextApiRequest, NextApiResponse } from 'next';
import { getOrCreateShop, updateShop, updateShopStatus } from '../../../lib/shops';
import { authAndGetShopId } from '../../../lib/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { headers, method } = req;

  try {
    const { payload } = await authAndGetShopId(headers.authorization);
    const ownerUserId = payload.sub;

    if (method === 'GET') {
      const shop = await getOrCreateShop(ownerUserId);
      res.status(200).json({ shop });
      return;
    }

    if (method === 'PUT') {
      const { name, purchaseMessage } = req.body ?? {};
      const shop = await updateShop(ownerUserId, {
        name,
        purchaseMessage,
      });
      res.status(200).json({ shop });
      return;
    }

    if (method === 'PATCH') {
      const { status } = req.body ?? {};
      if (status !== 'preparing' && status !== 'open') {
        res.status(400).json({ message: 'status には preparing か open を指定してください' });
        return;
      }
      const shop = await updateShopStatus(ownerUserId, status);
      res.status(200).json({ shop });
      return;
    }

    res.setHeader('Allow', 'GET,PUT,PATCH');
    res.status(405).json({ message: 'Method Not Allowed' });
  } catch (error) {
    res.status(401).json({ message: (error as Error).message });
  }
}
