import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyLineIdToken } from '../../lib/line-auth';
import { db } from '../../lib/firebase-admin';
import { createPendingOrder } from '../../lib/orders';
import { getProduct } from '../../lib/products';
import type { ShopRecord } from '../../lib/shops';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const {
    shopId,
    productId,
    quantity,
    buyerIdToken,
    questionResponse,
  } = req.body ?? {};

  if (!shopId || typeof shopId !== 'string') {
    res.status(400).json({ message: 'shopId を指定してください' });
    return;
  }
  if (!productId || typeof productId !== 'string') {
    res.status(400).json({ message: 'productId を指定してください' });
    return;
  }
  if (!buyerIdToken || typeof buyerIdToken !== 'string') {
    res.status(400).json({ message: 'buyerIdToken が必要です' });
    return;
  }

  try {
    const buyerPayload = await verifyLineIdToken(buyerIdToken);
    const buyerUserId = buyerPayload.sub;

    const shopSnapshot = await db.collection('shops').doc(shopId).get();
    if (!shopSnapshot.exists) {
      res.status(404).json({ message: 'ショップが見つかりません' });
      return;
    }
    const shopData = shopSnapshot.data();
    if (!shopData || shopData.status !== 'open') {
      res.status(403).json({ message: '現在このショップは購入できません' });
      return;
    }

    const shop: ShopRecord = {
      ownerUserId: shopData.ownerUserId,
      shopId,
      name: shopData.name,
      purchaseMessage: shopData.purchaseMessage,
      status: shopData.status,
      createdAt: shopData.createdAt ?? null,
      updatedAt: shopData.updatedAt ?? null,
    };

    const product = await getProduct(productId);
    if (product.shopId !== shopId) {
      res.status(400).json({ message: '商品がこのショップに属していません' });
      return;
    }
    if (product.isArchived) {
      res.status(400).json({ message: '販売停止中の商品です' });
      return;
    }
    if (product.inventory <= 0) {
      res.status(400).json({ message: '在庫がありません' });
      return;
    }

    const qty = Number(quantity ?? 1);

    const order = await createPendingOrder({
      shop,
      product,
      quantity: qty,
      buyerUserId,
      questionResponse,
    });

    res.status(201).json({ order });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
}
