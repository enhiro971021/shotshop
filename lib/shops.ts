import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';

export type ShopStatus = 'preparing' | 'open';

export type ShopRecord = {
  ownerUserId: string;
  shopId: string;
  name: string;
  purchaseMessage: string;
  status: ShopStatus;
  createdAt?: FirebaseFirestore.Timestamp | FieldValue;
  updatedAt?: FirebaseFirestore.Timestamp | FieldValue;
  contactPendingOrderId?: string | null;
};

const DEFAULT_PURCHASE_MESSAGE = 'ご購入ありがとうございます！支払い方法については追ってご連絡します。';

const SHOP_ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const SHOP_ID_LENGTH = 6;

function randomShopId() {
  let result = '';
  for (let i = 0; i < SHOP_ID_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * SHOP_ID_ALPHABET.length);
    result += SHOP_ID_ALPHABET[index];
  }
  return result;
}

async function generateUniqueShopId() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = randomShopId();
    const snapshot = await db
      .collection('shops')
      .where('shopId', '==', candidate)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return candidate;
    }
  }

  throw new Error('ショップIDの生成に失敗しました。時間をおいて再度お試しください');
}

export async function getOrCreateShop(ownerUserId: string) {
  const shopRef = db.collection('shops').doc(ownerUserId);
  const snapshot = await shopRef.get();

  if (snapshot.exists) {
    const data = snapshot.data() as ShopRecord;
    if (!data.shopId) {
      const newShopId = await generateUniqueShopId();
      await shopRef.set(
        {
          shopId: newShopId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      const updated = await shopRef.get();
      return updated.data() as ShopRecord;
    }
    return data;
  }

  const newShopId = await generateUniqueShopId();
  const shop: ShopRecord = {
    ownerUserId,
    shopId: newShopId,
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
  const shopRef = db.collection('shops').doc(ownerUserId);
  const snapshot = await shopRef.get();

  if (!snapshot.exists) {
    throw new Error('ショップが見つかりません。先に /api/session で初期化してください');
  }

  return snapshot.data() as ShopRecord;
}

export async function getShopByPublicId(shopId: string) {
  const snapshot = await db
    .collection('shops')
    .where('shopId', '==', shopId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as ShopRecord;
}

export async function updateShop(
  ownerUserId: string,
  payload: Pick<ShopRecord, 'name' | 'purchaseMessage'>
) {
  const { name, purchaseMessage } = payload;

  if (!name || name.trim().length === 0) {
    throw new Error('店舗名を入力してください');
  }

  if (!purchaseMessage || purchaseMessage.trim().length === 0) {
    throw new Error('購入時メッセージを入力してください');
  }

  const shopRef = db.collection('shops').doc(ownerUserId);
  await shopRef.set(
    {
      name: name.trim(),
      purchaseMessage: purchaseMessage.trim(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const snapshot = await shopRef.get();
  return snapshot.data() as ShopRecord;
}

export async function updateShopStatus(
  ownerUserId: string,
  status: ShopStatus
) {
  const shopRef = db.collection('shops').doc(ownerUserId);
  await shopRef.set(
    {
      status,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const snapshot = await shopRef.get();
  return snapshot.data() as ShopRecord;
}

export async function setContactPendingOrder(
  ownerUserId: string,
  orderId: string | null
) {
  const shopRef = db.collection('shops').doc(ownerUserId);
  await shopRef.set(
    {
      contactPendingOrderId: orderId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const snapshot = await shopRef.get();
  return snapshot.data() as ShopRecord;
}
