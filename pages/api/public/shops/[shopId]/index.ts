import type { NextApiRequest, NextApiResponse } from 'next';
import { getShopByPublicId } from '../../../../../lib/shops';

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

  const shop = await getShopByPublicId(shopId);
  if (!shop) {
    res.status(404).json({ message: 'ショップが見つかりません' });
    return;
  }

  if (shop.status !== 'open') {
    res.status(403).json({ message: '現在このショップは準備中です' });
    return;
  }

  res.status(200).json({
    shop: {
      shopId: shop.shopId,
      name: shop.name,
      purchaseMessage: shop.purchaseMessage,
      status: shop.status,
    },
  });
}
