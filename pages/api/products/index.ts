import type { NextApiRequest, NextApiResponse } from 'next';
import { authAndGetShopId } from '../../../lib/auth';
import { getOrCreateShop } from '../../../lib/shops';
import { createProduct, listProducts } from '../../../lib/products';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { payload, shopId } = await authAndGetShopId(
      req.headers.authorization
    );
    const ownerUserId = payload.sub;
    const shop = await getOrCreateShop(ownerUserId);

    if (req.method === 'GET') {
      const products = await listProducts(shopId);
      res.status(200).json({ items: products });
      return;
    }

    if (req.method === 'POST') {
      if (shop.status !== 'preparing') {
        res
          .status(400)
          .json({ message: 'ショップ公開中は商品の追加ができません' });
        return;
      }
      const product = await createProduct(shopId, req.body ?? {});
      res.status(201).json({ item: product });
      return;
    }

    res.setHeader('Allow', 'GET,POST');
    res.status(405).json({ message: 'Method Not Allowed' });
  } catch (error) {
    res.status(401).json({ message: (error as Error).message });
  }
}
