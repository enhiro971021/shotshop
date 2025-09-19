import type { NextApiRequest } from 'next';

const VERIFY_ENDPOINT = 'https://api.line.me/oauth2/v2.1/verify';

export type LineIdTokenPayload = {
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

export class UnauthorizedError extends Error {
  statusCode = 401;
}

export class ForbiddenError extends Error {
  statusCode = 403;
}

export function getLoginChannelId(): string {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) {
    throw new Error('LINE_LOGIN_CHANNEL_ID の環境変数を設定してください');
  }
  return channelId;
}

export async function verifyLineIdToken(
  idToken: string
): Promise<LineIdTokenPayload> {
  const clientId = getLoginChannelId();
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
    throw new UnauthorizedError(`LINE verify API error: ${reason}`);
  }

  const payload = (await response.json()) as LineIdTokenPayload;

  if (payload.aud !== clientId) {
    throw new UnauthorizedError('LINE verify response の aud が一致しません');
  }

  return payload;
}

export function extractBearerToken(req: NextApiRequest): string {
  const authorization = req.headers.authorization;

  if (!authorization) {
    throw new UnauthorizedError('Authorization ヘッダーが必要です');
  }

  const [scheme, token] = authorization.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') {
    throw new UnauthorizedError('Authorization ヘッダーが Bearer 形式ではありません');
  }

  return token;
}

export async function authenticateRequest(
  req: NextApiRequest
): Promise<LineIdTokenPayload> {
  const token = extractBearerToken(req);
  return verifyLineIdToken(token);
}
