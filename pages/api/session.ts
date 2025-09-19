import type { NextApiRequest, NextApiResponse } from 'next';

type LineVerifySuccess = {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  amr?: string[];
  name?: string;
  picture?: string;
  email?: string;
};

type SessionResponse = {
  userId: string;
  displayName?: string;
  pictureUrl?: string;
  email?: string;
};

type ErrorResponse = {
  message: string;
};

const VERIFY_ENDPOINT = 'https://api.line.me/oauth2/v2.1/verify';

function getLoginChannelId(): string {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) {
    throw new Error('LINE_LOGIN_CHANNEL_ID の環境変数を設定してください');
  }
  return channelId;
}

async function verifyIdToken(idToken: string, clientId: string) {
  const response = await fetch(VERIFY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: clientId,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const reason = errorBody || `HTTP ${response.status}`;
    throw new Error(`LINE verify API error: ${reason}`);
  }

  const payload = (await response.json()) as LineVerifySuccess;
  if (payload.aud !== clientId) {
    throw new Error('LINE verify response の aud が一致しません');
  }

  return payload;
}

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

  let channelId: string;
  try {
    channelId = getLoginChannelId();
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
    return;
  }

  try {
    const payload = await verifyIdToken(idToken, channelId);
    res.status(200).json({
      userId: payload.sub,
      displayName: payload.name,
      pictureUrl: payload.picture,
      email: payload.email,
    });
  } catch (error) {
    res.status(401).json({ message: (error as Error).message });
  }
}
