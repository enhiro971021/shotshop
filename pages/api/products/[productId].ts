import type { NextApiRequest, NextApiResponse } from 'next';
import { authAndGetShopId } from '../../../lib/auth';
import { getOrCreateShop } from '../../../lib/shops';
import {
  archiveProduct,
  getProduct,
  updateProduct,
} from '../../../lib/products';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { productId } = req.query;
  if (typeof productId !== 'string') {
    res.status(400).json({ message: 'productId が不正です' });
    return;
  }

  try {
    const { payload, shopId } = await authAndGetShopId(
      req.headers.authorization
    );
    const ownerUserId = payload.sub;
    const shop = await getOrCreateShop(ownerUserId);

    if (req.method === 'GET') {
      const product = await getProduct(productId);
      if (product.shopId !== shopId) {
        res.status(403).json({ message: 'この商品にアクセスできません' });
        return;
      }
      res.status(200).json({ item: product });
      return;
    }

    if (req.method === 'PUT') {
      const body = req.body ?? {};
      if (shop.status !== 'preparing') {
        res
          .status(403)
          .json({ message: 'ショップ公開中は商品を編集できません' });
        return;
      }

      const product = await updateProduct(shopId, productId, body);
      res.status(200).json({ item: product });
      return;
    }

    if (req.method === 'DELETE') {
      if (shop.status !== 'preparing') {
        res
          .status(403)
          .json({ message: 'ショップ公開中は商品を編集できません' });
        return;
      }
      await archiveProduct(shopId, productId);
      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'GET,PUT,DELETE');
    res.status(405).json({ message: 'Method Not Allowed' });
  } catch (error) {
    res.status(401).json({ message: (error as Error).message });
  }
}
