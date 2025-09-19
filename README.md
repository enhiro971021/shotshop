# shotshop

LINE Bot + LIFF アプリを Vercel 上で構築するための Next.js スターターです。

## セットアップ

1. Node.js 18 以上をインストールします。
2. 依存パッケージをインストールします。

   ```bash
   npm install
   ```

3. `.env.local` を作成し、LINE Developers / LIFF コンソールで発行した値を設定します。

   ```bash
   cp .env.local.example .env.local
   ```

   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `NEXT_PUBLIC_LIFF_ID`

4. 開発サーバーを起動します。

   ```bash
   npm run dev
   ```

   開発サーバー: <http://localhost:3000>

## プロジェクト構成

- `pages/index.tsx`: プロジェクト概要ページ
- `pages/liff.tsx`: LIFF クライアントのサンプル実装
- `pages/api/line-webhook.ts`: LINE Messaging API の Webhook エンドポイント
- `lib/line.ts`: LINE SDK 用のクライアント / ミドルウェアの初期化

## Vercel へのデプロイ

1. Vercel プロジェクトを作成し、本リポジトリを接続します。
2. Vercel の Project Settings > Environment Variables に以下を設定します。

   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `NEXT_PUBLIC_LIFF_ID`

3. デプロイ後、LINE Developers の Webhook URL を `https://<vercel-domain>/api/line-webhook` に設定し、利用開始してください。

## テスト送信

`line-webhook` は Text メッセージを受け取ると、その内容をエコーで返信します。まずは友だち追加した Bot にメッセージを送り、疎通確認を行ってください。
