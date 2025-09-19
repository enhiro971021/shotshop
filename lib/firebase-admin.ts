import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore as getFirestoreInternal } from 'firebase-admin/firestore';
import type { App, ServiceAccount } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';

type ServiceAccountJSON = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let firebaseApp: App | null = null;
let firestore: Firestore | null = null;

function loadServiceAccount(): ServiceAccountJSON {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT 環境変数が設定されていません');
  }

  let parsed: ServiceAccountJSON;
  try {
    parsed = JSON.parse(raw) as ServiceAccountJSON;
  } catch (error) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT の JSON 解析に失敗しました: ${(error as Error).message}`
    );
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT に必要なフィールドが不足しています');
  }

  // Vercel の環境変数に保存した際に \n へ変換されているケースを考慮
  return parsed;
}

function convertServiceAccount(
  json: ServiceAccountJSON
): ServiceAccount {
  return {
    projectId: json.project_id,
    clientEmail: json.client_email,
    privateKey: json.private_key.replace(/\\n/g, '\n'),
  };
}

export function getFirebaseApp(): App {
  if (firebaseApp) {
    return firebaseApp;
  }

  if (getApps().length > 0) {
    firebaseApp = getApp();
    return firebaseApp;
  }

  const serviceAccountJson = loadServiceAccount();
  const serviceAccount = convertServiceAccount(serviceAccountJson);

  firebaseApp = initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });

  return firebaseApp;
}

export function getFirestore(): Firestore {
  if (firestore) {
    return firestore;
  }

  firestore = getFirestoreInternal(getFirebaseApp());

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    firestore.settings({ ignoreUndefinedProperties: true });
  }

  return firestore;
}

export const db = ((): Firestore => getFirestore())();
