// Správa účtů členů týmu (jen pro správce).
// GET → seznam { name, workerId }; POST { name, password?, workerId } → založí/upraví; DELETE ?name= → smaže.
import { hashPassword, findEnvUser } from '../lib/auth.js';
import { loadAccounts, saveAccounts, findAccount, whoIs } from '../lib/accounts.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
async function adminOnly(request) {
  const who = await whoIs(request);
  if (!who) return json({ error: 'login' }, 401);
  if (!who.admin) return json({ error: 'Jen pro správce' }, 403);
  return null;
}
const pub = list => list.map(a => ({ name: a.name, workerId: a.workerId }));

export async function GET(request) {
  const deny = await adminOnly(request); if (deny) return deny;
  try { return json({ accounts: pub(await loadAccounts()) }); }
  catch (e) { console.error('GET accounts', e); return json({ error: String(e.message || e) }, 502); }
}

export async function POST(request) {
  const deny = await adminOnly(request); if (deny) return deny;
  let b; try { b = await request.json(); } catch { return json({ error: 'bad-json' }, 400); }
  const name = String(b.name || '').trim(), password = String(b.password || ''), workerId = String(b.workerId || '');
  if (!/^[\p{L}\p{N}._-]{2,40}$/u.test(name)) return json({ error: 'Přihlašovací jméno: 2–40 znaků, bez mezer.' }, 400);
  if (!workerId) return json({ error: 'Chybí člen týmu.' }, 400);
  if (findEnvUser(name)) return json({ error: 'Tohle jméno patří správci.' }, 400);
  if (password && password.length < 6) return json({ error: 'Heslo musí mít aspoň 6 znaků.' }, 400);
  try {
    let list = await loadAccounts();
    const taken = findAccount(list, name);
    if (taken && taken.workerId !== workerId) return json({ error: 'Tohle jméno už má jiný člen.' }, 400);
    const prev = list.find(a => a.workerId === workerId);
    if (!prev && !password) return json({ error: 'Zadej heslo.' }, 400);
    const cred = password ? await hashPassword(password) : { salt: prev.salt, hash: prev.hash };
    list = list.filter(a => a.workerId !== workerId);
    list.push({ name, workerId, ...cred });
    await saveAccounts(list);
    return json({ accounts: pub(list) });
  } catch (e) { console.error('POST accounts', e); return json({ error: String(e.message || e) }, 502); }
}

export async function DELETE(request) {
  const deny = await adminOnly(request); if (deny) return deny;
  const workerId = new URL(request.url).searchParams.get('workerId') || '';
  try {
    const list = (await loadAccounts()).filter(a => a.workerId !== workerId);
    await saveAccounts(list);
    return json({ accounts: pub(list) });
  } catch (e) { console.error('DELETE accounts', e); return json({ error: String(e.message || e) }, 502); }
}
