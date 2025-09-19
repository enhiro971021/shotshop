import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore } from './firebase-admin';

export type ShopStatus = 'preparing' | 'open';

export type ShopRecord = {
  ownerUserId: string;
  shopId: string;
  name: string;
  purchaseMessage: string;
  status: ShopStatus;
  createdAt?: FirebaseFirestore.Timestamp | FieldValue;
  updatedAt?: FirebaseFirestore.Timestamp | FieldValue;
};

const DEFAULT_PURCHASE_MESSAGE = 'ご購入ありがとうございます！支払い方法については追ってご連絡します。';

export async function getOrCreateShop(ownerUserId: string) {
  const db = getFirestore();
  const shopRef = db.collection('shops').doc(ownerUserId);
  const snapshot = await shopRef.get();

  if (snapshot.exists) {
    return snapshot.data() as ShopRecord;
  }

  const shop: ShopRecord = {
    ownerUserId,
    shopId: ownerUserId,
    name: '新しいショップ',
    purchaseMessage: DEFAULT_PURCHASE_MESSAGE,
    status: 'preparing',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await shopRef.set(shop, { merge: true });

  const created = await shopRef.get();
  return created.data() as ShopRecord;
}

export async function getShop(ownerUserId: string) {
  const db = getFirestore();
  const shopRef = db.collection('shops').doc(ownerUserId);
  const snapshot = await shopRef.get();

  if (!snapshot.exists) {
    throw new Error('ショップが見つかりません。先に /api/session で初期化してください');
  }

  return snapshot.data() as ShopRecord;
}
