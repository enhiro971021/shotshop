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

type UiError = {
  message: string;
  debug?: string;
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
  const [idToken, setIdToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<UiError | null>(null);
  const [actionState, setActionState] = useState<{
    orderId: string;
    action: OrderAction;
  } | null>(null);
  const [actionError, setActionError] = useState<UiError | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [liff, setLiff] =
    useState<(typeof import('@line/liff'))['default'] | null>(null);

  const debugMode = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return new URLSearchParams(window.location.search).get('debug') === '1';
  }, []);

  const toIsoString = useCallback((value: unknown): string | null => {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate?: () => Date }).toDate === 'function'
    ) {
      try {
        return (value as { toDate: () => Date }).toDate().toISOString();
      } catch {
        return null;
      }
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      '_seconds' in value &&
      typeof (value as { _seconds?: unknown })._seconds === 'number'
    ) {
      const seconds = (value as { _seconds: number })._seconds;
      const nanosCandidate =
        value as Record<string, unknown> & { _nanoseconds?: unknown };
      const nanos =
        typeof nanosCandidate._nanoseconds === 'number'
          ? nanosCandidate._nanoseconds
          : 0;
      const millis = seconds * 1000 + Math.floor(nanos / 1_000_000);
      return new Date(millis).toISOString();
    }

    return null;
  }, []);

  const normalizeOrder = useCallback(
    (raw: Record<string, unknown>): OrderSummary => {
      const itemsRaw = Array.isArray(raw.items)
        ? (raw.items as Array<Record<string, unknown>>)
        : [];

      const items: OrderItem[] = itemsRaw.map((item, index) => {
        if (!item || typeof item !== 'object') {
          return {
            name: `商品${index + 1}`,
            quantity: 0,
            unitPrice: 0,
          };
        }

        const quantityRaw = (item as { quantity?: unknown }).quantity;
        const unitPriceRaw = (item as { unitPrice?: unknown }).unitPrice;

        const quantity =
          typeof quantityRaw === 'number'
            ? quantityRaw
            : Number(quantityRaw ?? 0);

        const unitPrice =
          typeof unitPriceRaw === 'number'
            ? unitPriceRaw
            : Number(unitPriceRaw ?? 0);

        return {
          productId:
            typeof item.productId === 'string' ? item.productId : undefined,
          name:
            typeof item.name === 'string'
              ? item.name
              : `商品${index + 1}`,
          quantity: Number.isFinite(quantity) ? quantity : 0,
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        };
      });

      const totalRaw = raw.total;
      const total =
        typeof totalRaw === 'number'
          ? totalRaw
          : items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

      return {
        id: typeof raw.id === 'string' ? raw.id : 'unknown',
        createdAt: toIsoString(raw.createdAt),
        buyerDisplayId:
          typeof raw.buyerDisplayId === 'string'
            ? raw.buyerDisplayId
            : 'unknown',
        status:
          raw.status === 'accepted' ||
          raw.status === 'canceled' ||
          raw.status === 'pending'
            ? raw.status
            : 'pending',
        total,
        items,
        questionResponse:
          typeof raw.questionResponse === 'string'
            ? raw.questionResponse
            : raw.questionResponse != null
            ? String(raw.questionResponse)
            : null,
        memo:
          typeof raw.memo === 'string'
            ? raw.memo
            : raw.memo != null
            ? String(raw.memo)
            : null,
        closed: Boolean(raw.closed),
      };
    },
    [toIsoString]
  );

  const parseErrorResponse = useCallback(
    async (response: Response): Promise<UiError> => {
      try {
        const data = (await response.json()) as Record<string, unknown>;
        const message =
          typeof data?.error === 'string'
            ? data.error
            : typeof data?.message === 'string'
            ? data.message
            : `HTTP ${response.status}`;

        const debugInfo =
          typeof data?.debug === 'string' ? data.debug : undefined;

        return { message, debug: debugInfo };
      } catch {
        try {
          const text = await response.text();
          if (text) {
            return { message: text };
          }
        } catch {
          /* noop */
        }
        return { message: `HTTP ${response.status}` };
      }
    },
    []
  );

  const toUiError = useCallback((err: unknown): UiError => {
    if (err && typeof err === 'object' && 'message' in err) {
      const message = String((err as { message?: unknown }).message);
      const debugInfo =
        'debug' in err && typeof (err as { debug?: unknown }).debug === 'string'
          ? ((err as { debug?: string }).debug as string)
          : undefined;
      return { message, debug: debugInfo };
    }
    return { message: String(err) };
  }, []);

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
      const endpoint = debugMode ? '/api/orders?debug=1' : '/api/orders';
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const errorInfo = await parseErrorResponse(response);
        setOrdersError(errorInfo);
        setOrders([]);
        return;
      }

      const body = (await response.json()) as {
        items: Array<Record<string, unknown>>;
      };

      const normalized = body.items.map((item) => normalizeOrder(item));
      setOrders(normalized);
      setOrdersError(null);
    } catch (err) {
      setOrdersError(toUiError(err));
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [debugMode, idToken, normalizeOrder, parseErrorResponse, toUiError]);

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
        setActionError({ message: '認証情報が見つかりません' });
        return;
      }

      setActionState({ orderId, action });
      setActionMessage(null);
      setActionError(null);

      try {
        const endpoint = debugMode
          ? `/api/orders/${orderId}?debug=1`
          : `/api/orders/${orderId}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ action }),
        });

        if (!response.ok) {
          const errorInfo = await parseErrorResponse(response);
          setActionError(errorInfo);
          return;
        }

        const body = (await response.json()) as {
          item?: Record<string, unknown>;
        };

        if (!body.item || typeof body.item !== 'object') {
          setActionError({ message: '更新結果の形式が不正です' });
          return;
        }

        const normalized = normalizeOrder({
          id: typeof body.item.id === 'string' ? body.item.id : orderId,
          ...body.item,
        });

        setOrders((prev) =>
          prev.map((order) => (order.id === orderId ? normalized : order))
        );
        setActionMessage(
          action === 'accept'
            ? '注文を確定しました'
            : '注文をキャンセルしました'
        );
      } catch (err) {
        setActionError(toUiError(err));
      } finally {
        setActionState(null);
      }
    },
    [debugMode, idToken, normalizeOrder, parseErrorResponse, toUiError]
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
                <div style={{ color: 'crimson' }}>
                  <p>
                    注文取得に失敗しました: {ordersError.message}
                  </p>
                  {debugMode && ordersError.debug && (
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        background: '#fee',
                        padding: '0.5rem',
                        borderRadius: '4px',
                      }}
                    >
                      {ordersError.debug}
                    </pre>
                  )}
                </div>
              )}
              {!ordersLoading && !ordersError && orders.length === 0 && (
                <p>まだ注文はありません。</p>
              )}
              {actionMessage && (
                <p style={{ color: 'teal' }}>{actionMessage}</p>
              )}
              {actionError && (
                <div style={{ color: 'crimson' }}>
                  <p>操作に失敗しました: {actionError.message}</p>
                  {debugMode && actionError.debug && (
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        background: '#fee',
                        padding: '0.5rem',
                        borderRadius: '4px',
                      }}
                    >
                      {actionError.debug}
                    </pre>
                  )}
                </div>
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
