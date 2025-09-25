const ID = process.env.DIFY_DATASET_ID;
const KEY = process.env.DIFY_API_KEY;

(async ()=>{
  const url = `https://api.dify.ai/v1/datasets/${ID}/document/create-by-text`;
  const headers = { Authorization:`Bearer ${KEY}`, 'Content-Type':'application/json' };

  const payload = {
    name: `ping-${Date.now()}`,
    text: 'hello from actions',
    indexing_technique: 'high_quality',
    doc_form: 'text_model',
    process_rule: { mode: 'automatic' }
  };

  const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(payload) });
  console.log('PING status:', r.status, await r.text());
  if (!r.ok) process.exit(1);
})();
