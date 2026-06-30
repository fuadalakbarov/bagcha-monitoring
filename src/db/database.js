const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mrlysoiuphtmbcyjzjiv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer': 'return=representation'
  };
}

async function query(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers: getHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function insert(table, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function update(table, match, data) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(match).forEach(([k, v]) => url.searchParams.set(k, `eq.${v}`));
  const r = await fetch(url, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function count(table, match) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(match).forEach(([k, v]) => url.searchParams.set(k, `eq.${v}`));
  const r = await fetch(url, {
    headers: { ...getHeaders(), 'Prefer': 'count=exact', 'Range': '0-0' }
  });
  if (!r.ok) throw new Error(await r.text());
  const range = r.headers.get('content-range');
  return parseInt(range?.split('/')[1] || '0');
}

async function del(table, match) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(match).forEach(([k, v]) => url.searchParams.set(k, `eq.${v}`));
  const r = await fetch(url, { method: 'DELETE', headers: getHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json().catch(() => []);
}

module.exports = { query, insert, update, count, del };
