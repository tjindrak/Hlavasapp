// Společné funkce pro přihlášení (middleware i API funkce).
// Správci = účty z proměnných prostředí (HLAVAS_USERS / HLAVAS_LOGINS) – mohou všechno.
// Členové = účty vytvořené v aplikaci (uložené v Blob, viz lib/accounts.js) – vidí jen své hodiny.

export const COOKIE = 'hlavas_session';
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 dní
const enc = new TextEncoder();

export function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
}
export async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export function secret() {
  return process.env.HLAVAS_SECRET || process.env.BLOB_READ_WRITE_TOKEN || '';
}

/* správci z proměnných prostředí */
export function envUsers() {
  // "jmeno:heslo;jmeno2:heslo2" v HLAVAS_USERS (nebo i v HLAVAS_LOGINS)
  const pairs = [process.env.HLAVAS_USERS, process.env.HLAVAS_LOGINS].join(';');
  const list = pairs.split(';').map(s => s.trim()).filter(s => s.includes(':')).map(s => {
    const i = s.indexOf(':');
    return i > 0 ? { name: s.slice(0, i).trim(), pass: s.slice(i + 1).trim() } : null;
  }).filter(Boolean);
  // Druhá možnost: HLAVAS_LOGINS="jmeno1,jmeno2" a heslo každého v proměnné pojmenované jeho jménem.
  const names = String(process.env.HLAVAS_LOGINS || '').includes(':') ? '' : String(process.env.HLAVAS_LOGINS || '');
  for (const name of names.split(',').map(s => s.trim()).filter(Boolean)) {
    const pass = process.env[name];
    if (pass && !list.some(u => u.name === name)) list.push({ name, pass });
  }
  return list;
}
export function findEnvUser(name) {
  return envUsers().find(u => u.name.toLowerCase() === String(name).trim().toLowerCase()) || null;
}

/* cookie se sezením: base64("jmeno|expirace|role").podpis */
export function readCookie(req, name) {
  const m = (req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
export async function makeSession(name, role) {
  const payload = b64url(enc.encode(`${name}|${Math.floor(Date.now() / 1000) + MAX_AGE}|${role}`));
  return `${payload}.${await hmac(secret(), payload)}`;
}
export function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}
// Vrátí { name, role: 'admin' | 'member' } nebo null. Členy je potřeba ještě ověřit v seznamu účtů (API to dělá).
export async function readSession(req) {
  const s = secret(); if (!s) return null;
  const token = readCookie(req, COOKIE);
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sig, await hmac(s, payload))) return null;
  let parts;
  try { parts = unb64url(payload).split('|'); } catch { return null; }
  const [name, exp, role = 'admin'] = parts;
  if (!(Number(exp) > Date.now() / 1000)) return null;
  if (role === 'admin') return findEnvUser(name) ? { name, role } : null;
  if (role === 'member') return { name, role };
  return null;
}

/* hesla členů: PBKDF2-SHA256 */
export async function hashPassword(pass, saltB64) {
  const salt = saltB64 ? Uint8Array.from(unb64url(saltB64), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return { salt: b64url(salt), hash: b64url(bits) };
}
