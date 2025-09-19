import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <Head>
        <title>LINE Bot + LIFF Starter</title>
        <meta
          name="description"
          content="Scaffold for building a LINE bot with LIFF on Vercel"
        />
      </Head>
      <main>
        <h1>LINE Bot + LIFF Starter</h1>
        <p>
          このテンプレートは Next.js を使って LINE Messaging API の Webhook と LIFF ページを同居させ、
          Vercel にデプロイする想定の環境です。
        </p>
        <ol>
          <li>
            <code>LINE_CHANNEL_ACCESS_TOKEN</code> と <code>LINE_CHANNEL_SECRET</code> を環境変数に設定する
          </li>
          <li>
            LIFF コンソールで LIFF アプリを作成し、発行された <code>LIFF ID</code> を
            <code>NEXT_PUBLIC_LIFF_ID</code> として設定する
          </li>
          <li>
            Webhook URL に <code>/api/line-webhook</code> を指定して Vercel にデプロイする
          </li>
        </ol>
        <p>
          LIFF の動作確認は <Link href="/liff">/liff</Link> から行えます。
        </p>
      </main>
    </>
  );
}
