import type { NextApiRequest, NextApiResponse } from 'next';
import { getFirestore } from '../../../lib/firebase-admin';

type PingResponse = {
  ok: true;
  projectId: string | null;
  timestamp: string;
};

type ErrorResponse = {
  ok: false;
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PingResponse | ErrorResponse>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    return;
  }

  try {
    const firestore = getFirestore();
    await firestore.collection('__shotshop_healthcheck__').limit(1).get();

    res.status(200).json({
      ok: true,
      projectId: firestore.app?.options.projectId ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: (error as Error).message,
    });
  }
}
