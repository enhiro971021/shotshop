import Head from 'next/head';
import {
  Fragment,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import styles from '../styles/Manage.module.css';

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

type ShopDetail = {
  shopId: string;
  name: string;
  purchaseMessage: string;
  status: 'preparing' | 'open';
};

type ProductSummary = {
  id: string;
  shopId: string;
  name: string;
  description: string;
  price: number;
  inventory: number;
  imageUrl?: string;
  questionEnabled: boolean;
  questionText?: string;
};

type ProductDraft = {
  name: string;
  description: string;
  price: string;
  inventory: string;
  imageUrl: string;
  questionEnabled: boolean;
  questionText: string;
};

type OrderSummary = {
  id: string;
  shopId: string | null;
  createdAt: number | null;
  buyerDisplayId: string;
  status: 'pending' | 'accepted' | 'canceled';
  total: number;
  items: Array<{
    productId?: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
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
  const [shopDetail, setShopDetail] = useState<ShopDetail | null>(null);
  const [shopForm, setShopForm] = useState<{ name: string; purchaseMessage: string }>(
    { name: '', purchaseMessage: '' }
  );
  const [shopSaving, setShopSaving] = useState(false);
  const [shopError, setShopError] = useState<UiError | null>(null);
  const [shopMessage, setShopMessage] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<UiError | null>(null);
  const [orderDrafts, setOrderDrafts] = useState<
    Record<string, { memo: string; closed: boolean }>
  >({});
  const [orderSaving, setOrderSaving] = useState<Record<string, boolean>>({});
  const [actionState, setActionState] = useState<{
    orderId: string;
    action: OrderAction;
  } | null>(null);
  const [actionError, setActionError] = useState<UiError | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});
  const [productsLoading, setProductsLoading] = useState(false);
  const [productError, setProductError] = useState<UiError | null>(null);
  const [productSaving, setProductSaving] = useState<Record<string, boolean>>({});
  const [newProductDraft, setNewProductDraft] = useState<ProductDraft>({
    name: '',
    description: '',
    price: '',
    inventory: '1',
    imageUrl: '',
    questionEnabled: false,
    questionText: '',
  });
  const shopIsEditable = (shopDetail ?? session?.shop)?.status !== 'open';

  const debugMode = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return new URLSearchParams(window.location.search).get('debug') === '1';
  }, []);

  const formatTimestamp = useCallback((value: number | null) => {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }
    return date.toLocaleString('ja-JP');
  }, []);

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

  const loadShop = useCallback(async () => {
    if (!idToken) {
      return;
    }
    try {
      const response = await fetch('/api/shop', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const err = await parseErrorResponse(response);
        setShopError(err);
        return;
      }

      const body = (await response.json()) as { shop: ShopDetail };
      setShopDetail(body.shop);
      setShopForm({
        name: body.shop.name ?? '',
        purchaseMessage: body.shop.purchaseMessage ?? '',
      });
      setShopError(null);
    } catch (err) {
      setShopError(toUiError(err));
    }
  }, [idToken, parseErrorResponse, toUiError]);

  const loadProducts = useCallback(async () => {
    if (!idToken) {
      return;
    }
    setProductsLoading(true);
    setProductError(null);
    try {
      const endpoint = debugMode ? '/api/products?debug=1' : '/api/products';
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const err = await parseErrorResponse(response);
        setProductError(err);
        setProducts([]);
        setProductDrafts({});
        return;
      }

      const body = (await response.json()) as {
        items?: ProductSummary[];
      };

      const items = Array.isArray(body.items) ? body.items : [];
      setProducts(items);
      const drafts: Record<string, ProductDraft> = {};
      items.forEach((item) => {
        drafts[item.id] = {
          name: item.name ?? '',
          description: item.description ?? '',
          price: String(item.price ?? ''),
          inventory: String(item.inventory ?? ''),
          imageUrl: item.imageUrl ?? '',
          questionEnabled: Boolean(item.questionEnabled),
          questionText: item.questionText ?? '',
        };
      });
      setProductDrafts(drafts);
    } catch (err) {
      setProductError(toUiError(err));
      setProducts([]);
      setProductDrafts({});
    } finally {
      setProductsLoading(false);
    }
  }, [debugMode, idToken, parseErrorResponse, toUiError]);

  const handleShopInputChange = (
    field: 'name' | 'purchaseMessage',
    value: string
  ) => {
    setShopForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleShopSave = async () => {
    if (!idToken) {
      return;
    }
    setShopSaving(true);
    setShopError(null);
    setShopMessage(null);
    try {
      const response = await fetch('/api/shop', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(shopForm),
      });

      if (!response.ok) {
        const err = await parseErrorResponse(response);
        setShopError(err);
        return;
      }

      const body = (await response.json()) as { shop: ShopDetail };
      setShopDetail(body.shop);
      setShopMessage('ショップ情報を更新しました');
    } catch (err) {
      setShopError(toUiError(err));
    } finally {
      setShopSaving(false);
    }
  };

  const handleShopStatusToggle = async () => {
    if (!idToken || !shopDetail) {
      return;
    }
    const nextStatus = shopDetail.status === 'preparing' ? 'open' : 'preparing';
    setShopSaving(true);
    setShopError(null);
    setShopMessage(null);
    try {
      const response = await fetch('/api/shop', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        const err = await parseErrorResponse(response);
        setShopError(err);
        return;
      }

      const body = (await response.json()) as { shop: ShopDetail };
      setShopDetail(body.shop);
      setShopMessage(
        body.shop.status === 'open'
          ? 'ショップを公開しました'
          : 'ショップを準備中に戻しました'
      );
      await loadProducts();
    } catch (err) {
      setShopError(toUiError(err));
    } finally {
      setShopSaving(false);
    }
  };

  const handleNewProductChange = (
    field: keyof ProductDraft,
    value: string | boolean
  ) => {
    setNewProductDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetNewProductDraft = () => {
    setNewProductDraft({
      name: '',
      description: '',
      price: '',
      inventory: '1',
      imageUrl: '',
      questionEnabled: false,
      questionText: '',
    });
  };

  const handleCreateProductSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleCreateProduct();
  };

  const handleCreateProduct = async () => {
    if (!idToken) {
      return;
    }
    if (!shopIsEditable) {
      setProductError({
        message: 'ショップを準備中に切り替えてから商品を追加してください',
      });
      return;
    }
    setProductError(null);
    setProductSaving((prev) => ({ ...prev, __new__: true }));
    try {
      const payload = {
        name: newProductDraft.name,
        description: newProductDraft.description,
        price: Number(newProductDraft.price ?? 0),
        inventory: Number(newProductDraft.inventory ?? 0),
        imageUrl: newProductDraft.imageUrl,
        questionEnabled: newProductDraft.questionEnabled,
        questionText: newProductDraft.questionText,
      };

      const response = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await parseErrorResponse(response);
        setProductError(err);
        return;
      }

      resetNewProductDraft();
      await loadProducts();
    } catch (err) {
      setProductError(toUiError(err));
    } finally {
      setProductSaving((prev) => {
        const next = { ...prev };
        delete next.__new__;
        return next;
      });
    }
  };

  const handleProductDraftChange = (
    productId: string,
    field: keyof ProductDraft,
    value: string | boolean
  ) => {
    setProductDrafts((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  const handleProductSave = async (productId: string) => {
    if (!idToken || !shopDetail) {
      return;
    }

    const draft = productDrafts[productId];
    if (!draft) {
      return;
    }

    if (!shopIsEditable) {
      setProductError({
        message: 'ショップを準備中に切り替えてから商品を編集してください',
      });
      return;
    }

    setProductSaving((prev) => ({ ...prev, [productId]: true }));
    setProductError(null);

    const body: Record<string, unknown> = {};
    const original = products.find((item) => item.id === productId);

    if (!original) {
      setProductSaving((prev) => ({ ...prev, [productId]: false }));
      return;
    }

    const priceValue = Number(draft.price ?? 0);
    const hasPriceField = draft.price !== '' && !Number.isNaN(priceValue);
    const inventoryValue = Number(draft.inventory ?? 0);
    const hasInventoryField =
      draft.inventory !== '' && !Number.isNaN(inventoryValue);

    if (shopDetail.status === 'open') {
      if (!hasInventoryField) {
        setProductError({ message: '在庫数を入力してください' });
        setProductSaving((prev) => ({ ...prev, [productId]: false }));
        return;
      }
      body.inventory = inventoryValue;
    } else {
      if (draft.name !== original.name) {
        body.name = draft.name;
      }
      if (draft.description !== original.description) {
        body.description = draft.description;
      }
      if (hasPriceField && priceValue !== original.price) {
        body.price = priceValue;
      }
      if (hasInventoryField && inventoryValue !== original.inventory) {
        body.inventory = inventoryValue;
      }
      if (draft.imageUrl !== (original.imageUrl ?? '')) {
        body.imageUrl = draft.imageUrl;
      }
      if (draft.questionEnabled !== original.questionEnabled) {
        body.questionEnabled = draft.questionEnabled;
      }
      if ((draft.questionText ?? '') !== (original.questionText ?? '')) {
        body.questionText = draft.questionText;
      }
    }

    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await parseErrorResponse(response);
        setProductError(err);
        return;
      }

      await loadProducts();
    } catch (err) {
      setProductError(toUiError(err));
    } finally {
      setProductSaving((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const handleProductDelete = async (productId: string) => {
    if (!idToken) {
      return;
    }
    if (!shopIsEditable) {
      setProductError({
        message: 'ショップを準備中に切り替えてから商品を編集してください',
      });
      return;
    }
    if (!window.confirm('この商品を非表示にしますか？')) {
      return;
    }
    setProductSaving((prev) => ({ ...prev, [productId]: true }));
    setProductError(null);
    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const err = await parseErrorResponse(response);
        setProductError(err);
        return;
      }

      await loadProducts();
    } catch (err) {
      setProductError(toUiError(err));
    } finally {
      setProductSaving((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const handleOrderDraftChange = (
    orderId: string,
    field: 'memo' | 'closed',
    value: string | boolean
  ) => {
    setOrderDrafts((prev) => ({
      ...prev,
      [orderId]: {
        memo:
          field === 'memo'
            ? (value as string)
            : prev[orderId]?.memo ?? '',
        closed:
          field === 'closed'
            ? (value as boolean)
            : prev[orderId]?.closed ?? false,
      },
    }));
  };

  const handleOrderMetaSave = async (orderId: string) => {
    if (!idToken) {
      return;
    }
    const draft = orderDrafts[orderId];
    if (!draft) {
      return;
    }

    setOrderSaving((prev) => ({ ...prev, [orderId]: true }));
    setActionMessage(null);
    setActionError(null);
    try {
      const endpoint = debugMode
        ? `/api/orders/${orderId}?debug=1`
        : `/api/orders/${orderId}`;
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ memo: draft.memo, closed: draft.closed }),
      });

      if (!response.ok) {
        const err = await parseErrorResponse(response);
        setActionError(err);
        return;
      }

      const body = (await response.json()) as {
        item?: OrderSummary;
      };
      if (!body.item) {
        setActionError({ message: '更新結果の形式が不正です' });
        return;
      }
      setOrders((prev) =>
        prev.map((order) => (order.id === orderId ? body.item! : order))
      );
      setOrderDrafts((prev) => ({
        ...prev,
        [orderId]: {
          memo: body.item?.memo ?? '',
          closed: Boolean(body.item?.closed),
        },
      }));
      setActionMessage('注文メモを保存しました');
    } catch (err) {
      setActionError(toUiError(err));
    } finally {
      setOrderSaving((prev) => ({ ...prev, [orderId]: false }));
    }
  };

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
        items?: OrderSummary[];
      };

      const ordersFetched = Array.isArray(body.items) ? body.items : [];
      setOrders(ordersFetched);
      const drafts: Record<string, { memo: string; closed: boolean }> = {};
      ordersFetched.forEach((order) => {
        drafts[order.id] = {
          memo: order.memo ?? '',
          closed: Boolean(order.closed),
        };
      });
      setOrderDrafts(drafts);
      setOrdersError(null);
    } catch (err) {
      setOrdersError(toUiError(err));
      setOrders([]);
      setOrderDrafts({});
    } finally {
      setOrdersLoading(false);
    }
  }, [debugMode, idToken, parseErrorResponse, toUiError]);

  useEffect(() => {
    if (stage === 'authenticated' && idToken) {
      void loadShop();
      void loadProducts();
      void loadOrders();
    }
  }, [stage, idToken, loadOrders, loadProducts, loadShop]);

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

    const currentShop = shopDetail ?? session.shop;
    if (currentShop) {
      rows.push({ label: 'ショップID', value: currentShop.shopId });
      rows.push({ label: 'ショップ名', value: currentShop.name });
      rows.push({ label: 'ショップ状態', value: currentShop.status });
    }

    return rows;
  }, [session, shopDetail]);

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
          item?: OrderSummary;
        };

        if (!body.item) {
          setActionError({ message: '更新結果の形式が不正です' });
          return;
        }

        setOrders((prev) =>
          prev.map((order) => (order.id === orderId ? body.item! : order))
        );
        setOrderDrafts((prev) => ({
          ...prev,
          [orderId]: {
            memo: body.item?.memo ?? '',
            closed: Boolean(body.item?.closed),
          },
        }));
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
    [debugMode, idToken, parseErrorResponse, toUiError]
  );

  const handleOrderActionWithConfirm = useCallback(
    (orderId: string, action: OrderAction) => {
      const confirmationMessage =
        action === 'accept'
          ? '購入者に注文確定の通知が送信されます。続行しますか？'
          : '購入者にキャンセル通知が送信されます。続行しますか？';

      if (typeof window !== 'undefined') {
        const confirmed = window.confirm(confirmationMessage);
        if (!confirmed) {
          return;
        }
      }

      void handleOrderAction(orderId, action);
    },
    [handleOrderAction]
  );

  return (
    <>
      <Head>
        <title>ショップ管理</title>
      </Head>
      <main className={styles.container}>
        <div className={styles.content}>
          <h1 className={styles.pageTitle}>ショップ管理</h1>
          {stage === 'idle' && <p>LIFF の初期化を待機しています...</p>}
          {stage === 'initializing' && <p>LINE に接続中です...</p>}
          {stage === 'verifying' && <p>セッションを確認しています...</p>}
          {stage === 'error' && (
            <p className={styles.errorText}>
              認証に失敗しました: {error ?? '原因不明のエラー'}
            </p>
          )}
        {stage === 'authenticated' && session && (
          <div className={styles.stack}>
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>アカウント概要</h2>
                  <p className={styles.sectionDescription}>
                    LINE アカウントとショップの基本情報です。
                  </p>
                </div>
                { (shopDetail ?? session.shop) && (
                  <span
                    className={
                      (shopDetail ?? session.shop)?.status === 'open'
                        ? styles.badgeLive
                        : styles.badgeDraft
                    }
                  >
                    {(shopDetail ?? session.shop)?.status === 'open'
                      ? '公開中'
                      : '準備中'}
                  </span>
                )}
              </div>
              <dl className={styles.metaList}>
                {sessionRows.map((row) => (
                  <Fragment key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>ショップ設定</h2>
                  <p className={styles.sectionDescription}>
                    店舗名と購入時メッセージを更新できます。
                  </p>
                </div>
              </div>
              {shopError && (
                <div className={styles.errorBanner}>
                  <p>更新に失敗しました: {shopError.message}</p>
                  {debugMode && shopError.debug && <pre>{shopError.debug}</pre>}
                </div>
              )}
              {shopMessage && (
                <p className={styles.successText}>{shopMessage}</p>
              )}
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>店舗名</span>
                  <input
                    className={styles.input}
                    type="text"
                    value={shopForm.name}
                    onChange={(event) =>
                      handleShopInputChange('name', event.target.value)
                    }
                    disabled={shopSaving}
                  />
                </label>
                <label className={styles.field}>
                  <span>購入時メッセージ</span>
                  <textarea
                    className={styles.textarea}
                    value={shopForm.purchaseMessage}
                    onChange={(event) =>
                      handleShopInputChange('purchaseMessage', event.target.value)
                    }
                    rows={4}
                    disabled={shopSaving}
                  />
                </label>
              </div>
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleShopSave}
                  disabled={shopSaving || !shopForm.name}
                >
                  保存
                </button>
                <button
                  type="button"
                  className={styles.outlineButton}
                  onClick={handleShopStatusToggle}
                  disabled={shopSaving}
                >
                  {shopDetail?.status === 'open'
                    ? '準備中に戻す'
                    : '公開する'}
                </button>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>商品管理</h2>
                  <p className={styles.sectionDescription}>
                    商品の追加と在庫調整を行います。
                  </p>
                </div>
              </div>
              {productError && (
                <div className={styles.errorBanner}>
                  <p>商品操作に失敗しました: {productError.message}</p>
                  {debugMode && productError.debug && <pre>{productError.debug}</pre>}
                </div>
              )}
              {shopDetail?.status === 'open' && (
                <p className={styles.note}>
                  ショップ公開中は商品の追加・編集ができません。準備中に切り替えてから操作してください。
                </p>
              )}
              <form className={styles.productForm} onSubmit={handleCreateProductSubmit}>
                <h3 className={styles.subheading}>商品を追加</h3>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>商品名</span>
                    <input
                      className={styles.input}
                      type="text"
                      value={newProductDraft.name}
                      onChange={(event) =>
                        handleNewProductChange('name', event.target.value)
                      }
                      required
                      disabled={!shopIsEditable || Boolean(productSaving.__new__)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>説明</span>
                    <textarea
                      className={styles.textarea}
                      value={newProductDraft.description}
                      onChange={(event) =>
                        handleNewProductChange('description', event.target.value)
                      }
                      rows={3}
                      disabled={!shopIsEditable || Boolean(productSaving.__new__)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>価格（税込）</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={newProductDraft.price}
                      onChange={(event) =>
                        handleNewProductChange('price', event.target.value)
                      }
                      required
                      disabled={!shopIsEditable || Boolean(productSaving.__new__)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>在庫数</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={newProductDraft.inventory}
                      onChange={(event) =>
                        handleNewProductChange('inventory', event.target.value)
                      }
                      required
                      disabled={!shopIsEditable || Boolean(productSaving.__new__)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>商品画像URL</span>
                    <input
                      className={styles.input}
                      type="url"
                      value={newProductDraft.imageUrl}
                      onChange={(event) =>
                        handleNewProductChange('imageUrl', event.target.value)
                      }
                      disabled={!shopIsEditable || Boolean(productSaving.__new__)}
                    />
                  </label>
                  <label className={`${styles.field} ${styles.checkboxField}`}>
                    <input
                      type="checkbox"
                      checked={newProductDraft.questionEnabled}
                      onChange={(event) =>
                        handleNewProductChange(
                          'questionEnabled',
                          event.target.checked
                        )
                      }
                      disabled={!shopIsEditable || Boolean(productSaving.__new__)}
                    />
                    <span>購入時質問を有効にする</span>
                  </label>
                  {newProductDraft.questionEnabled && (
                    <label className={styles.field}>
                      <span>質問文</span>
                      <textarea
                        className={styles.textarea}
                        value={newProductDraft.questionText}
                        onChange={(event) =>
                          handleNewProductChange(
                            'questionText',
                            event.target.value
                          )
                        }
                        rows={2}
                        disabled={!shopIsEditable || Boolean(productSaving.__new__)}
                      />
                    </label>
                  )}
                </div>
              <div className={styles.buttonRow}>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={!shopIsEditable || Boolean(productSaving.__new__)}
                >
                  商品を追加
                </button>
              </div>
            </form>

              {productsLoading ? (
                <p>商品を読み込んでいます...</p>
              ) : products.length === 0 ? (
                <p className={styles.note}>登録済みの商品はありません。</p>
              ) : (
                <div className={styles.productGrid}>
                  {products.map((product) => {
                    const draft =
                      productDrafts[product.id] ?? {
                        name: product.name ?? '',
                        description: product.description ?? '',
                        price: String(product.price ?? ''),
                        inventory: String(product.inventory ?? ''),
                        imageUrl: product.imageUrl ?? '',
                        questionEnabled: Boolean(product.questionEnabled),
                        questionText: product.questionText ?? '',
                      };

                    const saving = Boolean(productSaving[product.id]);
                    const disableFields = !shopIsEditable;

                    return (
                      <article key={product.id} className={styles.productCard}>
                        <div className={styles.productCardHeader}>
                          <div>
                            <h3>{product.name || '商品名未設定'}</h3>
                            <p className={styles.productMeta}>
                              在庫 {product.inventory} / {product.price.toLocaleString()} 円
                            </p>
                          </div>
                          {product.inventory <= 3 && (
                            <span className={styles.badgeWarning}>在庫わずか</span>
                          )}
                        </div>
                        <div className={styles.formGrid}>
                          <label className={styles.field}>
                            <span>商品名</span>
                            <input
                              className={styles.input}
                              type="text"
                              value={draft.name}
                              disabled={disableFields || saving}
                              onChange={(event) =>
                                handleProductDraftChange(
                                  product.id,
                                  'name',
                                  event.target.value
                                )
                              }
                            />
                          </label>
                          <label className={styles.field}>
                            <span>説明</span>
                            <textarea
                              className={styles.textarea}
                              value={draft.description}
                              disabled={disableFields || saving}
                              onChange={(event) =>
                                handleProductDraftChange(
                                  product.id,
                                  'description',
                                  event.target.value
                                )
                              }
                              rows={3}
                            />
                          </label>
                          <label className={styles.field}>
                            <span>価格（税込）</span>
                            <input
                              className={styles.input}
                              type="number"
                              min={0}
                              value={draft.price}
                              disabled={disableFields || saving}
                              onChange={(event) =>
                                handleProductDraftChange(
                                  product.id,
                                  'price',
                                  event.target.value
                                )
                              }
                            />
                          </label>
                          <label className={styles.field}>
                            <span>在庫数</span>
                            <input
                              className={styles.input}
                              type="number"
                              min={0}
                              value={draft.inventory}
                              disabled={saving || disableFields}
                              onChange={(event) =>
                                handleProductDraftChange(
                                  product.id,
                                  'inventory',
                                  event.target.value
                                )
                              }
                            />
                          </label>
                          <label className={styles.field}>
                            <span>商品画像URL</span>
                            <input
                              className={styles.input}
                              type="url"
                              value={draft.imageUrl}
                              disabled={disableFields || saving}
                              onChange={(event) =>
                                handleProductDraftChange(
                                  product.id,
                                  'imageUrl',
                                  event.target.value
                                )
                              }
                            />
                          </label>
                          <label className={`${styles.field} ${styles.checkboxField}`}>
                            <input
                              type="checkbox"
                              checked={draft.questionEnabled}
                              disabled={disableFields || saving}
                              onChange={(event) =>
                                handleProductDraftChange(
                                  product.id,
                                  'questionEnabled',
                                  event.target.checked
                                )
                              }
                            />
                            <span>購入時質問を有効にする</span>
                          </label>
                          {draft.questionEnabled && (
                            <label className={styles.field}>
                              <span>質問文</span>
                              <textarea
                                className={styles.textarea}
                                value={draft.questionText}
                                disabled={disableFields || saving}
                                onChange={(event) =>
                                  handleProductDraftChange(
                                    product.id,
                                    'questionText',
                                    event.target.value
                                  )
                                }
                                rows={2}
                              />
                            </label>
                          )}
                        </div>
                        <div className={styles.buttonRow}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => handleProductSave(product.id)}
                            disabled={saving || disableFields}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className={styles.destructiveButton}
                            onClick={() => handleProductDelete(product.id)}
                            disabled={saving || disableFields}
                          >
                            非表示にする
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={`${styles.card} ${styles.ordersCard}`}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>受注一覧</h2>
                  <p className={styles.sectionDescription}>
                    注文のステータスとメモを管理します。
                  </p>
                </div>
              </div>
              {ordersLoading && <p>注文を読み込んでいます...</p>}
              {!ordersLoading && ordersError && (
                <div className={styles.errorBanner}>
                  <p>注文取得に失敗しました: {ordersError.message}</p>
                  {debugMode && ordersError.debug && <pre>{ordersError.debug}</pre>}
                </div>
              )}
              {actionMessage && (
                <p className={styles.successText}>{actionMessage}</p>
              )}
              {actionError && (
                <div className={styles.errorBanner}>
                  <p>操作に失敗しました: {actionError.message}</p>
                  {debugMode && actionError.debug && <pre>{actionError.debug}</pre>}
                </div>
              )}
              {!ordersLoading && !ordersError && orders.length === 0 ? (
                <p className={styles.note}>まだ注文はありません。</p>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <colgroup>
                      <col className={styles.colOrderId} />
                      <col className={styles.colDate} />
                      <col className={styles.colBuyerId} />
                      <col className={styles.colProducts} />
                      <col className={styles.colTotal} />
                      <col className={styles.colQuestion} />
                      <col className={styles.colStatus} />
                      <col className={styles.colMemo} />
                      <col className={styles.colActions} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>注文ID</th>
                        <th>購入日</th>
                        <th>購入者ID</th>
                        <th>商品</th>
                        <th>合計</th>
                        <th>質問回答</th>
                        <th>ステータス</th>
                        <th>メモ / 取引終了</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => {
                        const canAccept = order.status === 'pending';
                        const canCancel =
                          order.status === 'pending' || order.status === 'accepted';
                        const isProcessing =
                          actionState?.orderId === order.id;
                        const draft =
                          orderDrafts[order.id] ?? {
                            memo: order.memo ?? '',
                            closed: Boolean(order.closed),
                          };
                        const savingMeta = Boolean(orderSaving[order.id]);

                        return (
                          <tr key={order.id}>
                            <td>{order.id}</td>
                            <td>{formatTimestamp(order.createdAt)}</td>
                            <td>{order.buyerDisplayId}</td>
                            <td>
                              <ul className={styles.itemList}>
                                {order.items.map((item, index) => (
                                  <li key={`${order.id}-${index}`}>
                                    {item.name} × {item.quantity}（
                                    {formatCurrency(item.unitPrice)}）
                                  </li>
                                ))}
                              </ul>
                            </td>
                            <td>{formatCurrency(order.total)}</td>
                            <td>{order.questionResponse || '-'}</td>
                            <td>{order.status}</td>
                            <td>
                              <div className={styles.orderMetaControls}>
                                <textarea
                                  className={styles.textarea}
                                  value={draft.memo}
                                  rows={2}
                                  onChange={(event) =>
                                    handleOrderDraftChange(
                                      order.id,
                                      'memo',
                                      event.target.value
                                    )
                                  }
                                />
                                <label className={styles.checkboxField}>
                                  <input
                                    type="checkbox"
                                    checked={draft.closed}
                                    onChange={(event) =>
                                      handleOrderDraftChange(
                                        order.id,
                                        'closed',
                                        event.target.checked
                                      )
                                    }
                                  />
                                  <span>取引終了</span>
                                </label>
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() => handleOrderMetaSave(order.id)}
                                  disabled={savingMeta}
                                >
                                  メモを保存
                                </button>
                              </div>
                            </td>
                            <td>
                              {canAccept || canCancel ? (
                                <div className={styles.inlineButtons}>
                                  {canAccept && (
                                    <button
                                      type="button"
                                      className={styles.primaryButton}
                                      onClick={() =>
                                        handleOrderActionWithConfirm(
                                          order.id,
                                          'accept'
                                        )
                                      }
                                      disabled={isProcessing}
                                    >
                                      {isProcessing &&
                                      actionState?.action === 'accept'
                                        ? '処理中...'
                                        : '注文確定'}
                                    </button>
                                  )}
                                  {canCancel && (
                                    <button
                                      type="button"
                                      className={styles.outlineButton}
                                      onClick={() =>
                                        handleOrderActionWithConfirm(
                                          order.id,
                                          'cancel'
                                        )
                                      }
                                      disabled={isProcessing}
                                    >
                                      {isProcessing &&
                                      actionState?.action === 'cancel'
                                        ? '処理中...'
                                        : 'キャンセル'}
                                    </button>
                                  )}
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
                </div>
              )}
            </section>
          </div>
        )}
        </div>
      </main>
    </>
  );
}
