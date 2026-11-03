'use strict';

const dns = require('node:dns/promises');
const net = require('node:net');
const { AppError } = require('../../core/errors');

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const MAX_TEXT = 20_000;
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

const unreadable = () => new AppError(422, 'URL_UNREADABLE', 'Adres okunamadı');

/** Özel / loopback / link-local / metadata adresi mi @param {string} ip */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
}

/**
 * SSRF korumalı getirme: yalnızca http/https, her adımda DNS denetimi, en çok 3 yönlendirme, 10 sn, ≤ 2 MB.
 * @param {{ doFetch: () => typeof fetch, lookup: () => (host: string) => Promise<string[]> }} o
 */
function createFetcher({ doFetch, lookup }) {
  /** @param {URL} url */
  async function assertPublic(url) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw unreadable();
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const ips = net.isIP(host) ? [host] : await lookup()(host).catch(() => /** @type {string[]} */ ([]));
    if (!ips.length || ips.some(isPrivateIp)) throw unreadable();
  }

  /** @param {string} raw @returns {Promise<{ buffer: Buffer, type: string }>} */
  async function get(raw) {
    try {
      let url = new URL(raw);
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        await assertPublic(url);
        const res = await doFetch()(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'ResumerBot/1.0' } });
        const location = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && location) {
          url = new URL(location, url);
          continue;
        }
        if (!res.ok || !res.body) throw unreadable();
        /** @type {Buffer[]} */
        const chunks = [];
        let size = 0;
        for await (const chunk of /** @type {any} */ (res.body)) {
          size += chunk.length;
          if (size > MAX_BYTES) throw unreadable();
          chunks.push(Buffer.from(chunk));
        }
        return { buffer: Buffer.concat(chunks), type: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
    }
    throw unreadable();
  }

  return {
    /** HTML → script/style atılmış düz metin (≤ 20.000 karakter) @param {string} url */
    async fetchPageText(url) {
      const { buffer, type } = await get(url);
      let text = buffer.toString('utf8');
      if (type.includes('html') || /<html|<body|<div|<p[ >]/i.test(text.slice(0, 2000))) {
        text = text
          .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
          .replace(/<!--[\s\S]*?-->/g, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, '&');
      }
      text = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      if (!text) throw unreadable();
      return text;
    },

    /** @param {string} url @returns {Promise<{ buffer: Buffer, mime: string }>} */
    async fetchImage(url) {
      const { buffer, type } = await get(url);
      if (!IMAGE_MIMES.includes(type)) throw unreadable();
      return { buffer, mime: type };
    },
  };
}

/** @returns {(host: string) => Promise<string[]>} */
const systemLookup = () => async (host) => (await dns.lookup(host, { all: true })).map((a) => a.address);

module.exports = { createFetcher, systemLookup, isPrivateIp };
