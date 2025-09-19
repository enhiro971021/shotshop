import type { NextApiRequest, NextApiResponse } from 'next';
import {
  UnauthorizedError,
  verifyLineIdToken,
} from '../../lib/line-auth';
import { getOrCreateShop } from '../../lib/shops';

type SessionResponse = {
  userId: string;
  displayName?: string;
  pictureUrl?: string;
  email?: string;
  shop: {
    shopId: string;
    name: string;
    status: 'preparing' | 'open';
    purchaseMessage: string;
  };
};

type ErrorResponse = {
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SessionResponse | ErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const { idToken } = req.body ?? {};

  if (!idToken || typeof idToken !== 'string') {
    res.status(400).json({ message: 'idToken を指定してください' });
    return;
  }

  try {
    const payload = await verifyLineIdToken(idToken);
    const shop = await getOrCreateShop(payload.sub);

    res.status(200).json({
      userId: payload.sub,
      displayName: payload.name,
      pictureUrl: payload.picture,
      email: payload.email,
      shop: {
        shopId: shop.shopId,
        name: shop.name,
        status: shop.status,
        purchaseMessage: shop.purchaseMessage,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: (error as Error).message });
  }
}
