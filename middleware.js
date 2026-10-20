// Přihlášení pro Hlavasapp (Vercel Routing Middleware).
// Správci jsou jen v proměnných prostředí na Vercelu, nikdy v kódu:
//   HLAVAS_USERS  = "jmeno1:heslo1;jmeno2:heslo2"
//   nebo HLAVAS_LOGINS = "jmeno1,jmeno2" + proměnná pojmenovaná jménem s heslem (např. jmeno1 = heslo1)
//   HLAVAS_SECRET = (nepovinné) klíč pro podpis cookie; když chybí, použije se tajný token úložiště Blob
// Členy týmu zakládají správci přímo v aplikaci (api/accounts.js). Samotné přihlášení řeší api/login.js.
import { COOKIE, envUsers, secret, readSession } from './lib/auth.js';

export const config = { matcher: '/:path*' };

const PUBLIC = new Set(['/login.html', '/favicon.svg', '/api/login']);

function next() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
function redirect(url, location, extraHeaders = {}) {
  return new Response(null, { status: 303, headers: { Location: new URL(location, url).toString(), ...extraHeaders } });
}

export default async function middleware(req) {
  const url = new URL(req.url);

  if (!secret() || !envUsers().length) {
    return new Response('Přihlášení není nastavené: doplň HLAVAS_USERS (nebo HLAVAS_LOGINS) v nastavení projektu na Vercelu.', {
      status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (url.pathname === '/api/logout') {
    return redirect(url, '/login.html', { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  }

  if (PUBLIC.has(url.pathname)) return next();

  if (await readSession(req)) return next();
  if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({ error: 'login' }), { status: 401, headers: { 'content-type': 'application/json' } });
  return redirect(url, '/login.html');
}
