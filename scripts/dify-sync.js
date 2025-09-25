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

const ts = (t) => t?.toDate ? t.toDate().toISOString() : (t ? new Date(t).toISOString() : '');

function buildText(d){
  const name = d?.name ?? '';
  const price = d?.price ?? '';
  const description = d?.description ?? '';
  const inventory = d?.inventory ?? 0;
  const isArchived = d?.isArchived === true;
  const questionEnabled = d?.questionEnabled ?? false;
  const questionText = d?.questionText ?? '';
  const shopId = d?.shopId ?? '';
  const createdAt = ts(d?.createdAt);
  const updatedAt = ts(d?.updatedAt);

  return [
    `# Name\n${name}`,
    `\n# Price\n${price} JPY`,
    `\n# Inventory\n${inventory}`,
    `\n# Shop ID\n${shopId}`,
    `\n# Description\n${description}`,
    `\n# Flags\nisArchived: ${isArchived}\nquestionEnabled: ${questionEnabled}\nquestionText: ${questionText}`,
    `\n# Timestamps\ncreatedAt: ${createdAt}\nupdatedAt: ${updatedAt}`
  ].join('\n');
}

// 同期条件：アーカイブされておらず在庫>0 の商品だけ
function shouldSync(d){
  if (d?.isArchived === true) return false;
  if ((d?.inventory ?? 0) <= 0) return false;
  return true;
}

async function difyCreateByText(name,text){
  const r = await fetch(`https://api.dify.ai/v1/datasets/${DIFY_DATASET_ID}/document/create-by-text`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${DIFY_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ name, text })
  });
  if(!r.ok) throw new Error(`create: ${r.status} ${await r.text()}`);
  return r.json();
}
async function difyUpdateByText(id,name,text){
  const r = await fetch(`https://api.dify.ai/v1/datasets/${DIFY_DATASET_ID}/documents/${id}/update-by-text`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${DIFY_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ name, text })
  });
  if(!r.ok) throw new Error(`update: ${r.status} ${await r.text()}`);
  return r.json();
}
async function difyDelete(id){
  const r = await fetch(`https://api.dify.ai/v1/datasets/${DIFY_DATASET_ID}/documents/${id}`, {
    method:'DELETE',
    headers:{ Authorization:`Bearer ${DIFY_API_KEY}` }
  });
  if(!r.ok && r.status!==404) throw new Error(`delete: ${r.status} ${await r.text()}`);
}

(async ()=>{
  console.log("Target Dataset ID:", (DIFY_DATASET_ID||"").slice(0,8)+"...");
  const snap = await db.collection('products').get(); // ← products だけを同期
  for (const doc of snap.docs){
    const d = doc.data();
    const difyId = d?.dify?.documentId;
    const name = `${d?.name ?? 'product'} (#${doc.id})`;

    if (shouldSync(d)){
      const text = buildText(d);
      if (difyId){
        await difyUpdateByText(difyId, name, text);
        console.log('updated', doc.id);
      } else {
        const { document } = await difyCreateByText(name, text);
        await doc.ref.set({ dify: { documentId: document?.id } }, { merge:true });
        console.log('created', doc.id, '->', document?.id);
      }
    } else {
      if (difyId){
        await difyDelete(difyId);
        await doc.ref.set({ dify: admin.firestore.FieldValue.delete() }, { merge:true });
        console.log('deleted', doc.id);
      }
    }
  }
})().catch(e=>{ console.error(e); process.exit(1); });
