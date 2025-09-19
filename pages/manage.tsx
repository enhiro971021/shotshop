import Head from 'next/head';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

type SessionPayload = {
  userId: string;
  displayName?: string;
  pictureUrl?: string;
  email?: string;
  shop: {
    shopId: string;
    name: string;
    status: 'preparing' | 'open';
    purchaseMessage: string;
  };
};

type OrderItem = {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

type OrderSummary = {
  id: string;
  createdAt: string | null;
  buyerDisplayId: string;
  status: 'pending' | 'accepted' | 'canceled';
  total: number;
  items: OrderItem[];
  questionResponse?: string | null;
  memo?: string | null;
  closed?: boolean;
};

type OrderAction = 'accept' | 'cancel';

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
  const [idToken, setIdToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<{
    orderId: string;
    action: OrderAction;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
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

        setIdToken(idToken);
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

  const loadOrders = useCallback(async () => {
    if (!idToken) {
      return;
    }

    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const response = await fetch('/api/orders', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }

      const body = (await response.json()) as { orders: OrderSummary[] };
      setOrders(body.orders);
    } catch (err) {
      setOrdersError((err as Error).message);
    } finally {
      setOrdersLoading(false);
    }
  }, [idToken]);

  useEffect(() => {
    if (stage === 'authenticated' && idToken) {
      void loadOrders();
    }
  }, [stage, idToken, loadOrders]);

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

    if (session.shop) {
      rows.push({ label: 'ショップID', value: session.shop.shopId });
      rows.push({ label: 'ショップ名', value: session.shop.name });
      rows.push({ label: 'ショップ状態', value: session.shop.status });
    }

    return rows;
  }, [session]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(value);

  const handleOrderAction = useCallback(
    async (orderId: string, action: OrderAction) => {
      if (!idToken) {
        setActionError('認証情報が見つかりません');
        return;
      }

      setActionState({ orderId, action });
      setActionMessage(null);
      setActionError(null);

      try {
        const response = await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ action }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }

        const body = (await response.json()) as { order: OrderSummary };
        setOrders((prev) =>
          prev.map((order) => (order.id === orderId ? body.order : order))
        );
        setActionMessage(
          action === 'accept'
            ? '注文を確定しました'
            : '注文をキャンセルしました'
        );
      } catch (err) {
        setActionError((err as Error).message);
      } finally {
        setActionState(null);
      }
    },
    [idToken]
  );

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
            <p>認証が完了しました。受注管理の準備が整いました。</p>
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

            <section>
              <h2>受注一覧</h2>
              {ordersLoading && <p>注文を読み込んでいます...</p>}
              {!ordersLoading && ordersError && (
                <p style={{ color: 'crimson' }}>注文取得に失敗しました: {ordersError}</p>
              )}
              {!ordersLoading && !ordersError && orders.length === 0 && (
                <p>まだ注文はありません。</p>
              )}
              {actionMessage && (
                <p style={{ color: 'teal' }}>{actionMessage}</p>
              )}
              {actionError && (
                <p style={{ color: 'crimson' }}>操作に失敗しました: {actionError}</p>
              )}
              {!ordersLoading && !ordersError && orders.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>注文ID</th>
                      <th>購入日</th>
                      <th>購入者ID</th>
                      <th>商品</th>
                      <th>合計</th>
                      <th>ステータス</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const isPending = order.status === 'pending';
                      const isProcessing =
                        actionState?.orderId === order.id;

                      return (
                        <tr key={order.id}>
                          <td>{order.id}</td>
                          <td>{order.createdAt ?? '-'}</td>
                          <td>{order.buyerDisplayId}</td>
                          <td>
                            <ul>
                              {order.items.map((item, index) => (
                                <li key={`${order.id}-${index}`}>
                                  {item.name} × {item.quantity}（
                                  {formatCurrency(item.unitPrice)}）
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td>{formatCurrency(order.total)}</td>
                          <td>{order.status}</td>
                          <td>
                            {isPending ? (
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOrderAction(order.id, 'accept')
                                  }
                                  disabled={isProcessing}
                                >
                                  {isProcessing &&
                                  actionState?.action === 'accept'
                                    ? '処理中...'
                                    : '注文確定'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOrderAction(order.id, 'cancel')
                                  }
                                  disabled={isProcessing}
                                >
                                  {isProcessing &&
                                  actionState?.action === 'cancel'
                                    ? '処理中...'
                                    : 'キャンセル'}
                                </button>
                              </div>
                            ) : (
                              <span>-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </section>
        )}
      </main>
    </>
  );
}
