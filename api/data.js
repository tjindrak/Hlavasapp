// Sdílená data Hlavasapp: jeden soukromý JSON ve Vercel Blob ({ v: číslo verze, data }).
// Přístup hlídá middleware.js (bez přihlášení se sem nikdo nedostane).
// Zápis projde jen tehdy, když klient vychází z aktuální verze;
// jinak vrátí 409 s aktuálními daty a klient změny sloučí.
import { get, put } from '@vercel/blob';

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
  if (!r || r.statusCode !== 200) return { version: '0', data: null, etag: null, n: 0 };
  const doc = JSON.parse(await new Response(r.stream).text());
  const wrapped = doc && typeof doc.v === 'number' && 'data' in doc;
  return {
    version: wrapped ? String(doc.v) : 'legacy-' + (r.blob.etag || '1'),
    data: wrapped ? doc.data : doc,
    etag: r.blob.etag || null,
    n: wrapped ? doc.v : 0,
  };
}
const pub = c => ({ version: c.version, data: c.data });

export async function GET() {
  if (!configured()) return json({ error: 'not-configured' }, 503);
  try { return json(pub(await current())); }
  catch (e) { console.error('GET /api/data', e); return json({ error: String(e.message || e) }, 502); }
}

export async function PUT(request) {
  if (!configured()) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad-json' }, 400); }
  if (!body || typeof body.data !== 'object' || !Array.isArray(body.data.workers)) return json({ error: 'bad-data' }, 400);
  try {
    const cur = await current();
    if (String(body.version ?? '0') !== cur.version) return json({ conflict: true, ...pub(cur) }, 409);
    const next = cur.n + 1;
    const opts = { access: 'private', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60 };
    // Kontrolu verze dělá porovnání čísla výše. ETag z get() Blob při zápisu (ifMatch) nepřijímá
    // („ETag mismatch“), proto se zapisuje bez něj.
    opts.allowOverwrite = cur.data !== null;
    try {
      await put(PATH, JSON.stringify({ v: next, data: body.data }), opts);
    } catch (e) {
      // někdo zapsal mezi čtením a zápisem (nebo jiná chyba): vrátím aktuální stav, klient to sloučí
      console.error('PUT /api/data write', e);
      const now = await current();
      if (now.version !== cur.version) return json({ conflict: true, ...pub(now) }, 409);
      throw e;
    }
    return json({ version: String(next) });
  } catch (e) {
    console.error('PUT /api/data', e);
    return json({ error: String(e.message || e) }, 502);
  }
}
