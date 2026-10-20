// Sdílená data Hlavasapp: jeden soukromý JSON ve Vercel Blob ({ v: číslo verze, data }).
// Správci čtou a zapisují všechno. Členové vidí jen souhrn hodin ostatních a zapisují jen
// své výkazy hodin a ceníky/faktury, které sami vytvořili (hlídá to server, ne prohlížeč).
// Zápis projde jen tehdy, když klient vychází z aktuální verze; jinak vrátí 409 s aktuálními daty.
import { get, put } from '@vercel/blob';
import { whoIs } from '../lib/accounts.js';

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
  if (!r || r.statusCode !== 200) return { version: '0', data: null, n: 0 };
  const doc = JSON.parse(await new Response(r.stream).text());
  const wrapped = doc && typeof doc.v === 'number' && 'data' in doc;
  return {
    version: wrapped ? String(doc.v) : 'legacy-' + (r.blob.etag || '1'),
    data: wrapped ? doc.data : doc,
    n: wrapped ? doc.v : 0,
  };
}
const clone = x => JSON.parse(JSON.stringify(x));
const sumHours = w => (w.logs || []).reduce((a, l) => a + (+l.hours || 0), 0);

/* co uvidí člen: u ostatních jen jméno, fotku, role a součet hodin; u sebe i své záznamy.
   Hodnocení a pozitivní/negativní poznámky neuvidí nikdo kromě správců. */
function memberView(data, who) {
  if (!data) return data;
  const d = clone(data);
  d.workers = (d.workers || []).map(w => {
    const v = { id: w.id, name: w.name, roles: w.roles, position: w.position, photo: w.photo, total: sumHours(w), logs: [] };
    if (w.id === who.account.workerId) v.logs = w.logs || [];
    return v;
  });
  return d;
}
function cleanLogs(logs) {
  return (Array.isArray(logs) ? logs : []).filter(l => l && typeof l === 'object' && l.id).slice(0, 5000).map(l => ({
    id: String(l.id).slice(0, 40), date: String(l.date || '').slice(0, 10), hours: Math.max(0, Math.min(1000, +l.hours || 0)),
    note: String(l.note || '').slice(0, 2000), created: +l.created || Date.now(),
  }));
}
/* kdo a kdy záznam hodin přidal / naposledy upravil – vyplňuje server, klient to nemůže podvrhnout */
function stampLogs(oldLogs, newLogs, user, now) {
  const prev = new Map((oldLogs || []).map(l => [l.id, l]));
  return (newLogs || []).map(l => {
    const o = prev.get(l.id), out = { ...l };
    delete out.createdBy; delete out.updatedBy; delete out.updated;
    if (!o) { out.createdBy = user; out.created = now; return out; }
    out.created = o.created;
    if (o.createdBy) out.createdBy = o.createdBy;
    const changed = o.date !== l.date || +o.hours !== +l.hours || (o.note || '') !== (l.note || '');
    if (changed) { out.updatedBy = user; out.updated = now; }
    else if (o.updated) { out.updatedBy = o.updatedBy; out.updated = o.updated; }
    return out;
  });
}
function stampAll(server, next, user) {
  const now = Date.now(), old = new Map(((server && server.workers) || []).map(w => [w.id, w]));
  for (const w of next.workers || []) if (w && Array.isArray(w.logs)) w.logs = stampLogs((old.get(w.id) || {}).logs, w.logs, user, now);
  return next;
}
/* zápis člena: ze serverových dat se změní jen jeho hodiny a jeho vlastní doklady */
function applyMember(server, sub, who) {
  const user = who.name, out = clone(server || { workers: [], docs: [] });
  out.workers = out.workers || []; out.docs = out.docs || [];
  const w = out.workers.find(x => x.id === who.account.workerId);
  const sw = (sub.workers || []).find(x => x && x.id === who.account.workerId);
  if (w && sw) w.logs = stampLogs(w.logs, cleanLogs(sw.logs), user, Date.now());
  const subDocs = new Map((Array.isArray(sub.docs) ? sub.docs : []).filter(d => d && typeof d === 'object' && d.id).map(d => [String(d.id), d]));
  const known = new Set(out.docs.map(d => d.id));
  out.docs = out.docs
    .filter(d => d.createdBy !== user || subDocs.has(d.id))
    .map(d => d.createdBy === user ? { ...subDocs.get(d.id), id: d.id, createdBy: user } : d);
  for (const [id, d] of subDocs) if (!known.has(id)) out.docs.push({ ...d, id, createdBy: user });
  return out;
}

export async function GET(request) {
  if (!configured()) return json({ error: 'not-configured' }, 503);
  try {
    const who = await whoIs(request);
    if (!who) return json({ error: 'login' }, 401);
    const cur = await current();
    return json({
      version: cur.version,
      data: who.admin ? cur.data : memberView(cur.data, who),
      me: { name: who.name, admin: who.admin, workerId: who.admin ? null : who.account.workerId },
    });
  } catch (e) { console.error('GET /api/data', e); return json({ error: String(e.message || e) }, 502); }
}

export async function PUT(request) {
  if (!configured()) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad-json' }, 400); }
  if (!body || typeof body.data !== 'object' || !Array.isArray(body.data.workers)) return json({ error: 'bad-data' }, 400);
  try {
    const who = await whoIs(request);
    if (!who) return json({ error: 'login' }, 401);
    const view = d => who.admin ? d : memberView(d, who);
    const cur = await current();
    if (String(body.version ?? '0') !== cur.version) return json({ conflict: true, version: cur.version, data: view(cur.data) }, 409);
    const nextData = who.admin ? stampAll(cur.data, body.data, who.name) : applyMember(cur.data, body.data, who);
    const next = cur.n + 1;
    // Kontrolu verze dělá porovnání čísla výše. ETag z get() Blob při zápisu (ifMatch) nepřijímá
    // („ETag mismatch“), proto se zapisuje bez něj.
    const opts = { access: 'private', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60, allowOverwrite: cur.data !== null };
    try {
      await put(PATH, JSON.stringify({ v: next, data: nextData }), opts);
    } catch (e) {
      // někdo zapsal mezi čtením a zápisem (nebo jiná chyba): vrátím aktuální stav, klient to sloučí
      console.error('PUT /api/data write', e);
      const now = await current();
      if (now.version !== cur.version) return json({ conflict: true, version: now.version, data: view(now.data) }, 409);
      throw e;
    }
    return json({ version: String(next) });
  } catch (e) {
    console.error('PUT /api/data', e);
    return json({ error: String(e.message || e) }, 502);
  }
}
