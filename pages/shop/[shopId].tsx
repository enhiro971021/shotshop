import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

const INITIAL_LIFF_ERROR = 'LIFFの初期化に失敗しました';

type ShopPublic = {
  shopId: string;
  name: string;
  purchaseMessage: string;
};

type ProductPublic = {
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

type UiError = {
  message: string;
  debug?: string;
};

export default function ShopPage() {
  const router = useRouter();
  const { shopId } = router.query;
  const [buyerToken, setBuyerToken] = useState<string | null>(null);
  const [shop, setShop] = useState<ShopPublic | null>(null);
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [questionResponse, setQuestionResponse] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const questionRequired = useMemo(() => {
    const product = products.find((item) => item.id === selectedProductId);
    return product?.questionEnabled ?? false;
  }, [products, selectedProductId]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const liffId = process.env.NEXT_PUBLIC_SHOP_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setError({ message: 'NEXT_PUBLIC_SHOP_LIFF_ID が設定されていません' });
      setLoading(false);
      return;
    }

    const bootstrap = async () => {
      try {
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        const idToken = liff.getIDToken();
        if (!idToken) {
          setError({ message: INITIAL_LIFF_ERROR });
          setLoading(false);
          return;
        }
        setBuyerToken(idToken);
      } catch (err) {
        setError({ message: INITIAL_LIFF_ERROR, debug: (err as Error).message });
        setLoading(false);
      }
    };

    void bootstrap();
  }, [router.isReady]);

  const fetchShop = useCallback(async () => {
    if (!shopId || typeof shopId !== 'string') {
      return;
    }
    try {
      const [shopRes, productsRes] = await Promise.all([
        fetch(`/api/public/shops/${shopId}`),
        fetch(`/api/public/shops/${shopId}/products`),
      ]);

      if (!shopRes.ok) {
        const text = await shopRes.text();
        throw new Error(text || `SHOP HTTP ${shopRes.status}`);
      }
      if (!productsRes.ok) {
        const text = await productsRes.text();
        throw new Error(text || `PRODUCT HTTP ${productsRes.status}`);
      }

      const shopBody = (await shopRes.json()) as { shop: ShopPublic };
      const productBody = (await productsRes.json()) as {
        items?: ProductPublic[];
      };

      setShop(shopBody.shop);
      const items = Array.isArray(productBody.items) ? productBody.items : [];
      setProducts(items);
      if (items.length > 0) {
        setSelectedProductId(items[0].id);
      }
      setLoading(false);
    } catch (err) {
      setError({ message: String(err) });
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    if (buyerToken && shopId) {
      void fetchShop();
    }
  }, [buyerToken, shopId, fetchShop]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!buyerToken || typeof shopId !== 'string') {
      return;
    }

    setPlacingOrder(true);
    setMessage(null);
    try {
      const response = await fetch('/api/public/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopId,
          productId: selectedProductId,
          quantity,
          questionResponse,
          buyerIdToken: buyerToken,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }

      setMessage('注文が完了しました。出店者からの連絡をお待ちください。');
      setQuestionResponse('');
      await fetchShop();
    } catch (err) {
      setError({ message: String(err) });
    } finally {
      setPlacingOrder(false);
    }
  };

  if (loading) {
    return (
      <main>
        <p>読み込み中...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main>
        <h1>ショップ表示エラー</h1>
        <p style={{ color: 'crimson' }}>{error.message}</p>
        {error.debug && (
          <pre style={{ whiteSpace: 'pre-wrap' }}>{error.debug}</pre>
        )}
      </main>
    );
  }

  if (!shop) {
    return (
      <main>
        <p>ショップ情報が見つかりません。</p>
      </main>
    );
  }

  const selectedProduct = products.find((item) => item.id === selectedProductId);

  return (
    <>
      <Head>
        <title>{shop.name} | ショップ</title>
      </Head>
      <main>
        <h1>{shop.name}</h1>
        <section>
          <h2>ご案内</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{shop.purchaseMessage}</p>
        </section>

        {products.length === 0 ? (
          <p>現在、購入可能な商品はありません。</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
            <section>
              <h2>商品を選ぶ</h2>
              <select
                value={selectedProductId}
                onChange={(event) => {
                  setSelectedProductId(event.target.value);
                  setQuantity(1);
                  setQuestionResponse('');
                }}
                style={{ width: '100%', padding: '0.5rem' }}
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}（{product.price.toLocaleString()} 円）
                  </option>
                ))}
              </select>
              {selectedProduct && (
                <div style={{ marginTop: '0.5rem' }}>
                  {selectedProduct.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedProduct.imageUrl}
                      alt={selectedProduct.name}
                      style={{ maxWidth: '100%', borderRadius: '8px' }}
                    />
                  )}
                  <p>{selectedProduct.description}</p>
                  <p>在庫：{selectedProduct.inventory}</p>
                </div>
              )}
            </section>

            <section>
              <h2>数量</h2>
              <input
                type="number"
                min={1}
                max={selectedProduct?.inventory ?? 99}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                style={{ width: '100px' }}
              />
            </section>

            {questionRequired && (
              <section>
                <h2>購入時の質問</h2>
                <textarea
                  value={questionResponse}
                  onChange={(event) => setQuestionResponse(event.target.value)}
                  required
                  rows={3}
                  style={{ width: '100%' }}
                />
              </section>
            )}

            {message && <p style={{ color: 'teal' }}>{message}</p>}

            <button type="submit" disabled={placingOrder}>
              {placingOrder ? '送信中...' : '注文を確定する'}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
