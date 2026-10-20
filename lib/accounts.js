// Účty členů týmu (role „člen“), uložené jako soukromý JSON ve Vercel Blob.
// { accounts: [{ name, salt, hash, workerId }] } – heslo se ukládá jen jako hash.
import { get, put } from '@vercel/blob';
import { readSession } from './auth.js';

const PATH = 'hlavasapp/accounts.json';

export async function loadAccounts() {
  const r = await get(PATH, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return [];
  const doc = JSON.parse(await new Response(r.stream).text());
  return Array.isArray(doc.accounts) ? doc.accounts : [];
}
export async function saveAccounts(accounts) {
  await put(PATH, JSON.stringify({ accounts }), {
    access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60,
  });
}
export function findAccount(accounts, name) {
  const n = String(name || '').trim().toLowerCase();
  return accounts.find(a => a.name.toLowerCase() === n) || null;
}
// Kdo volá API: { name, admin: true } | { name, admin: false, account } | null
export async function whoIs(request) {
  const s = await readSession(request);
  if (!s) return null;
  if (s.role === 'admin') return { name: s.name, admin: true };
  const account = findAccount(await loadAccounts(), s.name);
  return account ? { name: account.name, admin: false, account } : null;
}
