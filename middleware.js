// Přihlášení pro Hlavasapp (Vercel Routing Middleware).
// Uživatelé a tajný klíč jsou jen v proměnných prostředí na Vercelu, nikdy v kódu:
//   HLAVAS_USERS  = "jmeno1:heslo1;jmeno2:heslo2"
//   HLAVAS_SECRET = dlouhý náhodný řetězec (podepisuje přihlašovací cookie)

export const config = { matcher: '/:path*' };

const COOKIE = 'hlavas_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dní
const PUBLIC = new Set(['/login.html', '/favicon.svg']);
const enc = new TextEncoder();

function next() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
function redirect(url, location, extraHeaders = {}) {
  return new Response(null, { status: 303, headers: { Location: new URL(location, url).toString(), ...extraHeaders } });
}
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function users() {
  return String(process.env.HLAVAS_USERS || '').split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const i = s.indexOf(':');
    return i > 0 ? { name: s.slice(0, i).trim(), pass: s.slice(i + 1) } : null;
  }).filter(Boolean);
}
function readCookie(req, name) {
  const m = (req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
async function validSession(token, secret) {
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sig, await hmac(secret, payload))) return false;
  const [name, exp] = atob(payload.replace(/-/g, '+').replace(/_/g, '/')).split('|');
  return Number(exp) > Date.now() / 1000 && users().some(u => u.name === name);
}

export default async function middleware(req) {
  const url = new URL(req.url);
  const secret = process.env.HLAVAS_SECRET;

  if (!secret || !users().length) {
    return new Response('Přihlášení není nastavené: doplň HLAVAS_USERS a HLAVAS_SECRET v nastavení projektu na Vercelu.', {
      status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const form = await req.formData();
    const name = String(form.get('user') || '').trim(), pass = String(form.get('pass') || '');
    const ok = users().some(u => safeEqual(u.name.toLowerCase(), name.toLowerCase()) && safeEqual(u.pass, pass));
    if (!ok) {
      await new Promise(r => setTimeout(r, 600)); // zpomalí hádání hesel
      return redirect(url, '/login.html?chyba=1');
    }
    const user = users().find(u => u.name.toLowerCase() === name.toLowerCase()).name;
    const payload = b64url(enc.encode(`${user}|${Math.floor(Date.now() / 1000) + MAX_AGE}`));
    const token = `${payload}.${await hmac(secret, payload)}`;
    return redirect(url, '/', {
      'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
    });
  }

  if (url.pathname === '/api/logout') {
    return redirect(url, '/login.html', { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  }

  if (PUBLIC.has(url.pathname)) return next();

  if (await validSession(readCookie(req, COOKIE), secret)) return next();
  return redirect(url, '/login.html');
}
