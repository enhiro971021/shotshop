import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  Fragment,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import styles from '../../styles/Shop.module.css';

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
  const [formError, setFormError] = useState<string | null>(null);

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
    setFormError(null);
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
      setFormError(String(err));
    } finally {
      setPlacingOrder(false);
    }
  };

  if (loading) {
    return (
      <main className={styles.container}>
        <div className={styles.content}>
          <p className={styles.note}>読み込み中...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.container}>
        <div className={styles.content}>
          <div className={styles.errorCard}>
            <h1>ショップ表示エラー</h1>
            <p>{error.message}</p>
            {error.debug && <pre>{error.debug}</pre>}
          </div>
        </div>
      </main>
    );
  }

  if (!shop) {
    return (
      <main className={styles.container}>
        <div className={styles.content}>
          <p className={styles.note}>ショップ情報が見つかりません。</p>
        </div>
      </main>
    );
  }

  const selectedProduct = products.find((item) => item.id === selectedProductId);

  return (
    <>
      <Head>
        <title>{shop.name} | ショップ</title>
      </Head>
      <main className={styles.container}>
        <div className={styles.content}>
          <section className={styles.hero}>
            <span className={styles.badge}>LINE Mini Shop</span>
            <h1>{shop.name}</h1>
            <p className={styles.heroDescription}>
              {shop.purchaseMessage.split('\n').map((line, index) => (
                <Fragment key={`hero-line-${index}`}>
                  {line}
                  <br />
                </Fragment>
              ))}
            </p>
          </section>

          {products.length === 0 ? (
            <div className={styles.emptyCard}>
              <h2>準備中の商品はありません</h2>
              <p>出店者の公開をお待ちください。</p>
            </div>
          ) : (
            <form className={styles.form} onSubmit={handleSubmit}>
              <section className={styles.formSection}>
                <h2>商品を選択</h2>
                <div className={styles.productGrid}>
                  {products.map((product) => {
                    const isSelected = selectedProductId === product.id;
                    return (
                      <label
                        key={product.id}
                        className={`${styles.productCard} ${
                          isSelected ? styles.productCardSelected : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="product"
                          value={product.id}
                          checked={isSelected}
                          onChange={() => {
                            setSelectedProductId(product.id);
                            setQuantity(1);
                            setQuestionResponse('');
                          }}
                          className={styles.productRadio}
                        />
                        <div className={styles.productBody}>
                          <div className={styles.productInfo}>
                            <h3>{product.name}</h3>
                            <p>{product.description || '説明はありません'}</p>
                          </div>
                          <div className={styles.productMetaRow}>
                            <span className={styles.priceTag}>
                              {product.price.toLocaleString()} 円
                            </span>
                            <span className={styles.inventoryTag}>
                              在庫 {product.inventory}
                            </span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className={styles.formSection}>
                <h2>数量の指定</h2>
                <div className={styles.quantityRow}>
                  <button
                    type="button"
                    className={styles.quantityButton}
                    onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                    disabled={quantity <= 1}
                  >
                    -
                  </button>
                  <input
                    className={styles.quantityInput}
                    type="number"
                    min={1}
                    max={selectedProduct?.inventory ?? 99}
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(Number(event.target.value))
                    }
                  />
                  <button
                    type="button"
                    className={styles.quantityButton}
                    onClick={() =>
                      setQuantity((prev) =>
                        Math.min((selectedProduct?.inventory ?? 99), prev + 1)
                      )
                    }
                    disabled={quantity >= (selectedProduct?.inventory ?? 99)}
                  >
                    +
                  </button>
                </div>
              </section>

              {questionRequired && (
                <section className={styles.formSection}>
                  <h2>購入時の質問</h2>
                  <textarea
                    className={styles.textarea}
                    value={questionResponse}
                    onChange={(event) => setQuestionResponse(event.target.value)}
                    required
                    rows={3}
                    placeholder="回答をご記入ください"
                  />
                </section>
              )}

              {formError && (
                <p className={styles.errorText}>{formError}</p>
              )}
              {message && <p className={styles.successText}>{message}</p>}

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={placingOrder}
              >
                {placingOrder ? '送信中…' : '注文を確定する'}
              </button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
