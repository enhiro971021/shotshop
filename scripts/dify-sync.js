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

function buildText(d){const{title,brand,price,currency='JPY',tags=[],description='',specs={},url=''}=d;
const specsLines=Object.entries(specs||{}).map(([k,v])=>`- ${k}: ${v}`).join('\n');
return [`# Title\n${title??''}`,'\n# Brand\n${brand??''}','\n# Price\n${price!=null?`${price} ${currency}`:''}','\n# Tags\n${Array.isArray(tags)?tags.join(', '):''}','\n# Description\n${description??''}','\n# Specs\n${specsLines}','\n# URL\n${url}`].join('\n');}
function shouldSync(d){return d?.published===true && (d?.stock??0)>0;}

async function difyCreateByText(name,text){
  const r=await fetch(`https://api.dify.ai/v1/datasets/${DIFY_DATASET_ID}/document/create-by-text`,{
    method:'POST',headers:{Authorization:`Bearer ${DIFY_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({name,text,indexing_technique:'high_quality',doc_form:'text_model'})
  }); if(!r.ok) throw new Error(await r.text()); return r.json();
}
async function difyUpdateByText(id,name,text){
  const r=await fetch(`https://api.dify.ai/v1/datasets/${DIFY_DATASET_ID}/documents/${id}/update-by-text`,{
    method:'POST',headers:{Authorization:`Bearer ${DIFY_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({name,text})
  }); if(!r.ok) throw new Error(await r.text()); return r.json();
}
async function difyDelete(id){
  const r=await fetch(`https://api.dify.ai/v1/datasets/${DIFY_DATASET_ID}/documents/${id}`,{
    method:'DELETE',headers:{Authorization:`Bearer ${DIFY_API_KEY}`}}); 
  if(!r.ok && r.status!==404) throw new Error(await r.text());
}

(async ()=>{
  const snap=await db.collection('products').get();
  for(const doc of snap.docs){
    const d=doc.data(); const difyId=d?.dify?.documentId; const name=`${d?.title??'product'} (#${doc.id})`;
    if(shouldSync(d)){
      const text=buildText(d);
      if(difyId){ await difyUpdateByText(difyId,name,text); console.log('updated',doc.id); }
      else { const {document}=await difyCreateByText(name,text);
             await doc.ref.set({dify:{documentId:document?.id}},{merge:true});
             console.log('created',doc.id,'->',document?.id); }
    }else{
      if(difyId){ await difyDelete(difyId);
                  await doc.ref.set({dify: admin.firestore.FieldValue.delete()},{merge:true});
                  console.log('deleted',doc.id); }
    }
  }
})().catch(e=>{console.error(e);process.exit(1);});
