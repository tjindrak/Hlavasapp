// Sdílená data Hlavasapp: jeden JSON v Upstash Redis (Vercel Marketplace → Upstash for Redis).
// Přístup hlídá middleware.js (bez přihlášení se sem nikdo nedostane).
// Každý zápis nese verzi, ze které klient vycházel; když mezitím uložil někdo jiný, vrátí se 409
// s aktuálními daty a klient změny sloučí.

const DATA_KEY = 'hlavasapp:data';
const VER_KEY = 'hlavasapp:version';

const CAS = `
local v = redis.call('GET', KEYS[2]) or '0'
if v ~= ARGV[1] then return {0, v} end
redis.call('SET', KEYS[1], ARGV[2])
return {1, tostring(redis.call('INCR', KEYS[2]))}
`;

function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
async function redis(c, command) {
  const r = await fetch(c.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `Redis ${r.status}`);
  return j.result;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
async function current(c) {
  const [data, version] = await redis(c, ['MGET', DATA_KEY, VER_KEY]);
  return { version: version || '0', data: data ? JSON.parse(data) : null };
}

export async function GET() {
  const c = creds();
  if (!c) return json({ error: 'not-configured' }, 503);
  try { return json(await current(c)); }
  catch (e) { return json({ error: String(e.message || e) }, 502); }
}

export async function PUT(request) {
  const c = creds();
  if (!c) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad-json' }, 400); }
  if (!body || typeof body.data !== 'object' || !Array.isArray(body.data.workers)) return json({ error: 'bad-data' }, 400);
  try {
    const [ok, version] = await redis(c, ['EVAL', CAS, '2', DATA_KEY, VER_KEY, String(body.version ?? '0'), JSON.stringify(body.data)]);
    if (Number(ok) === 1) return json({ version: String(version) });
    return json({ conflict: true, ...(await current(c)) }, 409);
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}
