import Head from 'next/head';
import Image from 'next/image';
import { useEffect, useState } from 'react';

type Liff = (typeof import('@line/liff'))['default'];

type LiffProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
};

export default function LiffPage() {
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liff, setLiff] = useState<Liff | null>(null);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

    if (!liffId) {
      setError('NEXT_PUBLIC_LIFF_ID が設定されていません。');
      setLoading(false);
      return;
    }

    const initLiff = async () => {
      try {
        const liffModule = (await import('@line/liff')).default;
        setLiff(liffModule);

        await liffModule.init({ liffId });

        if (!liffModule.isLoggedIn()) {
          liffModule.login();
          return;
        }

        const userProfile = await liffModule.getProfile();
        setProfile(userProfile);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void initLiff();
  }, []);

  const handleLogout = () => {
    if (!liff) {
      return;
    }
    liff.logout();
    window.location.reload();
  };

  return (
    <>
      <Head>
        <title>LIFF Demo</title>
      </Head>
      <main>
        <h1>LIFF Demo</h1>
        {loading && <p>読み込み中...</p>}
        {!loading && error && (
          <p style={{ color: 'crimson' }}>LIFF の初期化に失敗しました: {error}</p>
        )}
        {!loading && !error && profile && (
          <section>
            <h2>{profile.displayName}</h2>
            {profile.pictureUrl && (
              <Image
                src={profile.pictureUrl}
                alt={profile.displayName}
                width={120}
                height={120}
                style={{ borderRadius: '50%' }}
              />
            )}
            {profile.statusMessage && <p>{profile.statusMessage}</p>}
            <button type="button" onClick={handleLogout}>
              ログアウト
            </button>
          </section>
        )}
      </main>
    </>
  );
}
