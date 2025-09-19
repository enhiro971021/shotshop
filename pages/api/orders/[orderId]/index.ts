import type { NextApiRequest, NextApiResponse } from 'next';
import { authAndGetShopId } from '../../../../lib/auth';
import {
  updateOrderMeta,
  updateOrderStatus,
} from '../../../../lib/orders';

const ALLOWED_ACTIONS = ['accept', 'cancel'] as const;

type Action = (typeof ALLOWED_ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return ALLOWED_ACTIONS.includes(value as Action);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { orderId } = req.query;

  if (typeof orderId !== 'string') {
    res.status(400).json({ message: 'orderId が不正です' });
    return;
  }

  if (req.method !== 'POST' && req.method !== 'PATCH') {
    res.setHeader('Allow', 'POST,PATCH');
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const debug = req.query.debug === '1';

  try {
    const { shopId } = await authAndGetShopId(req.headers.authorization);
    if (req.method === 'POST') {
      const action = req.body?.action;
      if (!isAction(action)) {
        res
          .status(400)
          .json({ message: 'action は accept か cancel を指定してください' });
        return;
      }
      const updated = await updateOrderStatus(shopId, orderId, action);
      res.status(200).json({ item: updated });
      return;
    }

    const memo = req.body?.memo;
    const closed = req.body?.closed;
    const updated = await updateOrderMeta(shopId, orderId, {
      memo: typeof memo === 'string' ? memo : undefined,
      closed: typeof closed === 'boolean' ? closed : undefined,
    });
    res.status(200).json({ item: updated });
  } catch (error) {
    const err = error as Error;
    const message = err.message ?? String(error);
    let status = 400;

    if (message.includes('アクセス')) {
      status = 403;
    } else if (message.includes('見つかりません')) {
      status = 404;
    }

    const body: Record<string, unknown> = {
      error: message,
    };

    if (debug && typeof err.stack === 'string') {
      body.debug = err.stack;
    }

    res.status(status).json(body);
  }
}
