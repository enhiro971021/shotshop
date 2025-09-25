const ID = process.env.DIFY_DATASET_ID;
const KEY = process.env.DIFY_API_KEY;
(async ()=>{
const headers = { Authorization:`Bearer ${KEY}`, 'Content-Type':'application/json' };
const payload = { name: `ping-${Date.now()}`, text: 'hello from actions' };
const r = await fetch(`https://api.dify.ai/v1/datasets/${ID}/document/create-by-text`, {
method: 'POST', headers, body: JSON.stringify(payload)
});
const body = await r.text();
console.log('PING status:', r.status, body);
if (!r.ok) process.exit(1);
})();
