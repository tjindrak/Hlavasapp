// Sdílená data Hlavasapp: jeden soukromý JSON ve Vercel Blob.
// Přístup hlídá middleware.js (bez přihlášení se sem nikdo nedostane).
// Verze = ETag souboru. Zápis projde jen tehdy, když klient vychází z aktuální verze;
// jinak vrátí 409 s aktuálními daty a klient změny sloučí.
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const PATH = 'hlavasapp/data.json';

function configured() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
async function current() {
  const r = await get(PATH, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return { version: '0', data: null };
  return { version: r.blob.etag, data: JSON.parse(await new Response(r.stream).text()) };
}

export async function GET() {
  if (!configured()) return json({ error: 'not-configured' }, 503);
  try { return json(await current()); }
  catch (e) { return json({ error: String(e.message || e) }, 502); }
}

export async function PUT(request) {
  if (!configured()) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad-json' }, 400); }
  if (!body || typeof body.data !== 'object' || !Array.isArray(body.data.workers)) return json({ error: 'bad-data' }, 400);
  const version = String(body.version ?? '0');
  const opts = { access: 'private', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60 };
  if (version === '0') opts.allowOverwrite = false; else opts.ifMatch = version;
  try {
    const res = await put(PATH, JSON.stringify(body.data), opts);
    return json({ version: res.etag });
  } catch (e) {
    const conflict = e instanceof BlobPreconditionFailedError || /already exists/i.test(String(e.message));
    if (conflict) return json({ conflict: true, ...(await current()) }, 409);
    return json({ error: String(e.message || e) }, 502);
  }
}
