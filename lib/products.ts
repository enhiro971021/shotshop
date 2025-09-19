import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';

export type ProductRecord = {
  id: string;
  shopId: string;
  name: string;
  description: string;
  price: number;
  inventory: number;
  imageUrl?: string;
  questionEnabled: boolean;
  questionText?: string;
  createdAt?: FirebaseFirestore.Timestamp | FieldValue;
  updatedAt?: FirebaseFirestore.Timestamp | FieldValue;
  isArchived?: boolean;
};

function sanitizeInput(input: Partial<ProductRecord>) {
  if (typeof input.name === 'string') {
    input.name = input.name.trim();
  }
  if (typeof input.description === 'string') {
    input.description = input.description.trim();
  }
  if (typeof input.questionText === 'string') {
    input.questionText = input.questionText.trim();
  }
  if (typeof input.imageUrl === 'string') {
    input.imageUrl = input.imageUrl.trim();
  }
  return input;
}

export async function listProducts(shopId: string) {
  const snapshot = await db
    .collection('products')
    .where('shopId', '==', shopId)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((product) => product.isArchived !== true)
    .sort((a, b) => {
      const createdAtA = (a.createdAt as FirebaseFirestore.Timestamp | undefined)?.toMillis?.() ?? 0;
      const createdAtB = (b.createdAt as FirebaseFirestore.Timestamp | undefined)?.toMillis?.() ?? 0;
      return createdAtB - createdAtA;
    }) as ProductRecord[];
}

export async function getProduct(productId: string) {
  const doc = await db.collection('products').doc(productId).get();
  if (!doc.exists) {
    throw new Error('商品が見つかりません');
  }
  return { id: doc.id, ...doc.data() } as ProductRecord;
}

export async function createProduct(
  shopId: string,
  input: Omit<
    ProductRecord,
    'id' | 'shopId' | 'createdAt' | 'updatedAt' | 'isArchived'
  >
) {
  const data = sanitizeInput({ ...input });

  if (!data.name) {
    throw new Error('商品名を入力してください');
  }
  if (data.price == null || Number.isNaN(data.price)) {
    throw new Error('税込価格を入力してください');
  }
  if (data.inventory == null || Number.isNaN(data.inventory)) {
    throw new Error('在庫数を入力してください');
  }

  const payload = {
    ...data,
    shopId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    isArchived: false,
  } satisfies Omit<ProductRecord, 'id'>;

  const ref = await db.collection('products').add(payload);
  const created = await ref.get();
  return { id: created.id, ...created.data() } as ProductRecord;
}

export async function updateProduct(
  shopId: string,
  productId: string,
  input: Partial<ProductRecord>
) {
  const data = sanitizeInput({ ...input });
  const productRef = db.collection('products').doc(productId);
  const snapshot = await productRef.get();

  if (!snapshot.exists) {
    throw new Error('商品が見つかりません');
  }

  const product = snapshot.data() as ProductRecord;
  if (product.shopId !== shopId) {
    throw new Error('この商品の編集権限がありません');
  }

  await productRef.set(
    {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const updated = await productRef.get();
  return { id: updated.id, ...updated.data() } as ProductRecord;
}

export async function archiveProduct(shopId: string, productId: string) {
  const productRef = db.collection('products').doc(productId);
  const snapshot = await productRef.get();

  if (!snapshot.exists) {
    throw new Error('商品が見つかりません');
  }
  const product = snapshot.data() as ProductRecord;
  if (product.shopId !== shopId) {
    throw new Error('この商品の編集権限がありません');
  }

  await productRef.set(
    {
      isArchived: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function adjustInventory(
  productId: string,
  delta: number
) {
  const productRef = db.collection('products').doc(productId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(productRef);
    if (!snap.exists) {
      throw new Error('商品が見つかりません');
    }
    const data = snap.data() as ProductRecord;
    const nextInventory = (data.inventory ?? 0) + delta;
    if (nextInventory < 0) {
      throw new Error('在庫が不足しています');
    }
    tx.update(productRef, {
      inventory: nextInventory,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

 EOF
