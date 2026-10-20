// Přihlášení: správci z proměnných prostředí, členové z účtů v aplikaci.
import { findEnvUser, safeEqual, makeSession, sessionCookie, hashPassword, secret } from '../lib/auth.js';
import { loadAccounts, findAccount } from '../lib/accounts.js';

function redirect(request, location, headers = {}) {
  return new Response(null, { status: 303, headers: { Location: new URL(location, request.url).toString(), ...headers } });
}

export async function POST(request) {
  if (!secret()) return new Response('Přihlášení není nastavené.', { status: 503 });
  let name = '', pass = '';
  try {
    const form = await request.formData();
    name = String(form.get('user') || '').trim(); pass = String(form.get('pass') || '');
  } catch { /* prázdný formulář */ }

  let user = null, role = null;
  const env = name && findEnvUser(name);
  if (env && safeEqual(env.pass, pass)) { user = env.name; role = 'admin'; }
  else if (name && pass && !env) {
    try {
      const acc = findAccount(await loadAccounts(), name);
      if (acc && safeEqual((await hashPassword(pass, acc.salt)).hash, acc.hash)) { user = acc.name; role = 'member'; }
    } catch (e) { console.error('login accounts', e); }
  }
  if (!user) {
    await new Promise(r => setTimeout(r, 600)); // zpomalí hádání hesel
    return redirect(request, '/login.html?chyba=1');
  }
  return redirect(request, '/', { 'Set-Cookie': sessionCookie(await makeSession(user, role)) });
}
