import { verifyLineIdToken } from './line-auth';
import { getShop } from './shops';

export async function authAndGetShopId(authorization?: string) {
  if (!authorization) {
    throw new Error('Authorization header is required');
  }

  const [scheme, token] = authorization.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') {
    throw new Error('Authorization header must be Bearer token');
  }

  const payload = await verifyLineIdToken(token);
  const shop = await getShop(payload.sub);

  return { shopId: shop.shopId, payload };
}
