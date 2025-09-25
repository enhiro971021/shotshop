const admin = require('firebase-admin');

const SERVICE_ACCOUNT = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
};
admin.initializeApp({ credential: admin.credential.cert(SERVICE_ACCOUNT) });
const db = admin.firestore();

const DIFY_API_KEY = process.env.DIFY_API_KEY;
const DIFY_DATASET_ID = process.env.DIFY_DATASET_ID;
const DIFY_INDEXING_TECHNIQUE = process.env.DIFY_INDEXING_TECHNIQUE || 'high_quality';

async function main(){
  if(!DIFY_API_KEY || !DIFY_DATASET_ID){
    throw new Error('DIFY credentials are required');
  }

  console.log('Target Dataset ID:', (DIFY_DATASET_ID || '').slice(0, 8) + '...');
  const snap = await db.collection('products').limit(1).get();
  if (snap.empty){
    console.log('No products found.');
    return;
  }

  const doc = snap.docs[0];
  const data = doc.data() || {};
  const name = `${data.name ?? 'product'} (#${doc.id})`;
  const text = [
    `# Name\n${data.name ?? ''}`,
    `\n# Price\n${data.price ?? ''}`,
    `\n# Description\n${data.description ?? ''}`,
  ].join('\n');

  const payload = {
    name,
    indexing_technique: DIFY_INDEXING_TECHNIQUE,
    content: [{ type: 'text', text }],
  };

  console.log('Uploading document:', JSON.stringify({ name: payload.name, indexing_technique: payload.indexing_technique }));
  const res = await fetch(`https://api.dify.ai/v1/datasets/${DIFY_DATASET_ID}/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DIFY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  console.log('Response:', res.status, body);
  if (!res.ok){
    throw new Error(`Failed to upload document: ${res.status} ${body}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
