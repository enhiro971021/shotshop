import type { ClientConfig, MiddlewareConfig } from '@line/bot-sdk';
import { Client, middleware } from '@line/bot-sdk';

type LineConfig = ClientConfig & MiddlewareConfig;

function buildConfig(): LineConfig {
  return {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
    channelSecret: process.env.LINE_CHANNEL_SECRET ?? '',
  };
}

export function validateLineConfig() {
  const { channelAccessToken, channelSecret } = buildConfig();

  if (!channelAccessToken || !channelSecret) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN と LINE_CHANNEL_SECRET の環境変数を設定してください');
  }
}

let cachedClient: Client | null = null;
let cachedMiddleware: ReturnType<typeof middleware> | null = null;

export function getLineClient() {
  if (!cachedClient) {
    cachedClient = new Client(buildConfig());
  }
  return cachedClient;
}

export function getLineMiddleware() {
  if (!cachedMiddleware) {
    cachedMiddleware = middleware(buildConfig());
  }
  return cachedMiddleware;
}
