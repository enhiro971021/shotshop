import Head from 'next/head';
import { Fragment, useEffect, useMemo, useState } from 'react';

type SessionPayload = {
  userId: string;
  displayName?: string;
  pictureUrl?: string;
  email?: string;
};

type Stage =
  | 'idle'
  | 'initializing'
  | 'verifying'
  | 'authenticated'
  | 'error';

export default function ManagePage() {
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [liff, setLiff] =
    useState<(typeof import('@line/liff'))['default'] | null>(null);

  useEffect(() => {
    const liffId =
      process.env.NEXT_PUBLIC_MANAGE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID;

    if (!liffId) {
      setStage('error');
      setError('NEXT_PUBLIC_MANAGE_LIFF_ID または NEXT_PUBLIC_LIFF_ID が設定されていません');
      return;
    }

    const bootstrap = async () => {
      setStage('initializing');
      try {
        const liffModule = (await import('@line/liff')).default;
        setLiff(liffModule);

        await liffModule.init({ liffId });

        if (!liffModule.isLoggedIn()) {
          liffModule.login();
          return;
        }

        const idToken = liffModule.getIDToken();
        if (!idToken) {
          throw new Error('LIFF から idToken を取得できませんでした');
        }

        setStage('verifying');
        const response = await fetch('/api/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ idToken }),
        });

        if (!response.ok) {
          const bodyText = await response.text();
          let message = `HTTP ${response.status}`;
          if (bodyText) {
            try {
              const parsed = JSON.parse(bodyText) as { message?: string };
              message = parsed.message ?? bodyText;
            } catch {
              message = bodyText;
            }
          }
          throw new Error(message);
        }

        const payload = (await response.json()) as SessionPayload;
        setSession(payload);
        setStage('authenticated');
      } catch (err) {
        setError((err as Error).message);
        setStage('error');
      }
    };

    void bootstrap();
  }, []);

  const handleLogout = () => {
    if (liff) {
      liff.logout();
      window.location.reload();
    }
  };

  const sessionRows = useMemo(() => {
    if (!session) {
      return [] as Array<{ label: string; value: string }>;
    }

    const rows: Array<{ label: string; value: string }> = [
      {
        label: 'LINE User ID',
        value: session.userId,
      },
    ];

    if (session.displayName) {
      rows.push({ label: '表示名', value: session.displayName });
    }

    if (session.email) {
      rows.push({ label: 'メールアドレス', value: session.email });
    }

    return rows;
  }, [session]);

  return (
    <>
      <Head>
        <title>ショップ管理</title>
      </Head>
      <main>
        <h1>ショップ管理</h1>
        {stage === 'idle' && <p>LIFF の初期化を待機しています...</p>}
        {stage === 'initializing' && <p>LINE に接続中です...</p>}
        {stage === 'verifying' && <p>セッションを確認しています...</p>}
        {stage === 'error' && (
          <p style={{ color: 'crimson' }}>
            認証に失敗しました: {error ?? '原因不明のエラー'}
          </p>
        )}
        {stage === 'authenticated' && session && (
          <section>
            <p>認証が完了しました。管理機能を準備中です。</p>
            <dl>
              {sessionRows.map((row) => (
                <Fragment key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </Fragment>
              ))}
            </dl>
            <button type="button" onClick={handleLogout}>
              ログアウト
            </button>
          </section>
        )}
      </main>
    </>
  );
}
