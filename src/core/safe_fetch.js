'use strict';

const dns = require('node:dns/promises');
const net = require('node:net');
const { AppError } = require('./errors');

/**
 * Kullanıcının verdiği adrese sunucudan istek (bağlantı önizlemesi, URL'den görsel, webhook adresi) — OWASP API7 SSRF.
 * Yalnızca https, iç ağ / bulut meta veri adresleri (127.x, 10.x, 172.16–31.x, 192.168.x, 169.254.x, ::1, fc00::/7)
 * engelli, yönlendirme izlenmez (yeni adres yeniden denetlenir), zaman aşımı ve boyut sınırı.
 *
 *   const html = await safeFetch(body.url, { maxBytes: 512 * 1024 });   // yanlış adres → 422
 *
 * @param {string} rawUrl @param {{ timeoutMs?: number, maxBytes?: number, allowHosts?: string[], lookup?: typeof dns.lookup }} [o]
 * @returns {Promise<{ status: number, contentType: string, body: Buffer, url: string }>}
 */
async function safeFetch(rawUrl, { timeoutMs = 8000, maxBytes = 2 * 1024 * 1024, allowHosts, lookup = dns.lookup } = {}) {
  let url = rawUrl;
  for (let hop = 0; hop < 3; hop += 1) {
    const u = parse(url);
    if (allowHosts && !allowHosts.includes(u.hostname)) throw bad('Bu adrese istek yapılamaz');
    const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true }).catch(() => []);
    if (!addrs.length) throw bad('Adres çözümlenemedi');
    if (addrs.some((a) => isPrivate(a.address))) throw bad('İç ağ adreslerine istek yapılamaz');
    const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location') ?? '', u).toString();
      continue;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of /** @type {any} */ (res.body ?? [])) {
      size += chunk.length;
      if (size > maxBytes) throw bad('Cevap çok büyük');
      chunks.push(chunk);
    }
    return { status: res.status, contentType: res.headers.get('content-type') ?? '', body: Buffer.concat(chunks), url };
  }
  throw bad('Çok fazla yönlendirme');
}

/** @param {string} s */
function parse(s) {
  let u;
  try {
    u = new URL(s);
  } catch {
    throw bad('Geçersiz adres');
  }
  if (u.protocol !== 'https:') throw bad('Yalnızca https adresleri');
  if (u.username || u.password) throw bad('Kimlik bilgili adres kabul edilmez');
  return u;
}

/** @param {string} ip */
function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

const bad = (m) => new AppError(422, 'BAD_URL', m);

module.exports = { safeFetch, isPrivate };
