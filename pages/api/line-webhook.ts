import type { NextApiRequest, NextApiResponse } from 'next';
import type { WebhookEvent } from '@line/bot-sdk';
import {
  getLineClient,
  getLineMiddleware,
  validateLineConfig,
} from '../../lib/line';

export const config = {
  api: {
    bodyParser: false,
  },
};

function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  fn: ReturnType<typeof getLineMiddleware>
) {
  return new Promise<void>((resolve, reject) => {
    fn(req as never, res as never, (result: unknown) => {
      if (result instanceof Error) {
        reject(result);
        return;
      }
      resolve();
    });
  });
}

async function handleEvent(event: WebhookEvent) {
  if (event.type === 'message' && event.message.type === 'text') {
    await getLineClient().replyMessage(event.replyToken, [
      {
        type: 'text',
        text: `Echo: ${event.message.text}`,
      },
    ]);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET,HEAD,POST');
    res.status(405).end('Method Not Allowed');
    return;
  }

  try {
    validateLineConfig();
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
    return;
  }

  try {
    await runMiddleware(req, res, getLineMiddleware());
  } catch (error) {
    res.status(401).json({ message: (error as Error).message });
    return;
  }

  const body = (req as unknown as { body?: { events?: WebhookEvent[] } }).body;
  const events = body?.events ?? [];

  if (events.length === 0) {
    res.status(200).json({ status: 'no-events' });
    return;
  }

  await Promise.all(events.map((event) => handleEvent(event)));

  res.status(200).json({ status: 'handled' });
}
