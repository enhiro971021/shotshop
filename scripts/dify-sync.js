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

const ts = (t) => (t?.toDate ? t.toDate().toISOString() : (t ? new Date(t).toISOString() : ''));

function buildText(d){
  const name = d?.name ?? '';
  const price = d?.price ?? '';
  const currency = d?.currency ?? 'JPY';
  const description = d?.description ?? '';
  const inventory = d?.inventory ?? 0;
  const isArchived = d?.isArchived === true;
  const questionEnabled = d?.questionEnabled ?? false;
  const questionText = d?.questionText ?? '';
  const shopId = d?.shopId ?? '';
  const tags = Array.isArray(d?.tags) ? d.tags.join(', ') : '';
  const createdAt = ts(d?.createdAt);
  const updatedAt = ts(d?.updatedAt);

  return [
    `# Name\n${name}`,
    `\n# Price\n${price ? `${price} ${currency}` : ''}`,
    `\n# Inventory\n${inventory}`,
    `\n# Shop ID\n${shopId}`,
    `\n# Tags\n${tags}`,
    `\n# Description\n${description}`,
    `\n# Flags\nisArchived: ${isArchived}\nquestionEnabled: ${questionEnabled}\nquestionText: ${questionText}`,
    `\n# Timestamps\ncreatedAt: ${createdAt}\nupdatedAt: ${updatedAt}`
  ].join('\n');
}

function shouldSync(d){
  if (d?.isArchived === true) return false;
  if ((d?.inventory ?? 0) <= 0) return false;
  return true;
}

async function difyCreate(name, text) {
  const baseURL = `https://api.dify.ai/v1/datasets/${process.env.DIFY_DATASET_ID}`;
  const headers = { Authorization: `Bearer ${process.env.DIFY_API_KEY}`, 'Content-Type': 'application/json' };

  let payload = {
    name,
    text,
    indexing_technique: 'high_quality',
    doc_form: 'text_model',
    process_rule: { mode: 'automatic' }
  };

  let r = await fetch(`${baseURL}/document/create-by-text`, {
    method: 'POST', headers, body: JSON.stringify(payload)
  });
  let body = await r.text();
  if (r.ok) { try { return JSON.parse(body); } catch { return { raw: body }; } }

  console.warn('create(high_quality) failed:', r.status, body.slice(0, 200));

  payload.indexing_technique = 'economy';
  r = await fetch(`${baseURL}/document/create-by-text`, {
    method: 'POST', headers, body: JSON.stringify(payload)
  });
  body = await r.text();
  if (!r.ok) throw new Error(`create(economy): ${r.status} ${body}`);
  try { return JSON.parse(body); } catch { return { raw: body }; }
}

async function difyUpdate(documentId, name, text) {
  const url = `https://api.dify.ai/v1/datasets/${process.env.DIFY_DATASET_ID}/documents/${documentId}/update-by-text`;
  const headers = { Authorization: `Bearer ${process.env.DIFY_API_KEY}`, 'Content-Type': 'application/json' };
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ name, text }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`update: ${r.status} ${t}`);
  try { return JSON.parse(t); } catch { return { raw: t }; }
}

async function difyDelete(documentId) {
  const url = `https://api.dify.ai/v1/datasets/${process.env.DIFY_DATASET_ID}/documents/${documentId}`;
  const headers = { Authorization: `Bearer ${process.env.DIFY_API_KEY}` };
  const r = await fetch(url, { method: 'DELETE', headers });
  if (!r.ok && r.status !== 404) {
    const t = await r.text();
    throw new Error(`delete: ${r.status} ${t}`);
  }
}

async function main(){
  if (!DIFY_API_KEY || !DIFY_DATASET_ID) {
    throw new Error('DIFY credentials are required');
  }

  console.log('Target Dataset ID:', (DIFY_DATASET_ID || '').slice(0, 8) + '...');
  const snap = await db.collection('products').get();

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const difyId = data?.dify?.documentId;
    const name = `${data.name ?? 'product'} (#${doc.id})`;

    if (shouldSync(data)) {
      const text = buildText(data);
      if (difyId) {
        await difyUpdate(difyId, name, text);
        console.log('updated', doc.id);
      } else {
        const result = await difyCreate(name, text);
        const documentId = result?.document?.id || result?.id;
        if (!documentId) throw new Error('create succeeded but no document id returned');
        await doc.ref.set({ dify: { documentId } }, { merge: true });
        console.log('created', doc.id, '->', documentId);
      }
    } else if (difyId) {
      await difyDelete(difyId);
      await doc.ref.set({ dify: admin.firestore.FieldValue.delete() }, { merge: true });
      console.log('deleted', doc.id);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
