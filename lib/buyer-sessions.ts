import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin';

export type BuyerSessionState =
  | 'idle'
  | 'choosingProduct'
  | 'choosingQuantity'
  | 'answeringQuestion'
  | 'confirming';

export type BuyerSession = {
  buyerUserId: string;
  state: BuyerSessionState;
  shopId?: string;
  productId?: string;
  quantity?: number;
  questionResponse?: string | null;
  updatedAt: FieldValue;
};

const collection = db.collection('buyerSessions');

export async function getBuyerSession(buyerUserId: string) {
  const doc = await collection.doc(buyerUserId).get();
  if (!doc.exists) {
    return {
      buyerUserId,
      state: 'idle' as BuyerSessionState,
    };
  }
  const data = doc.data() as Omit<BuyerSession, 'updatedAt'> & {
    updatedAt?: FirebaseFirestore.Timestamp;
  };
  return {
    ...data,
    buyerUserId,
  };
}

export async function saveBuyerSession(
  buyerUserId: string,
  session: Omit<BuyerSession, 'updatedAt'>
) {
  await collection.doc(buyerUserId).set(
    {
      ...session,
      buyerUserId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function resetBuyerSession(buyerUserId: string) {
  await collection.doc(buyerUserId).delete().catch(() => undefined);
}
