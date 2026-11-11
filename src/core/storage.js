'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

/**
 * Dosya depolama (skill: media-pipeline). Tüm uygulamalar tek CDN depolama alanında, HER UYGULAMA KENDİ KLASÖRÜNDE:
 * yollar `MEDIA_PREFIX/` ile başlar (ör. `unio/avatars/2026/10/<id>-320.webp`); uygulama klasörünün içini kendisi
 * düzenler (avatars/, posts/, chats/…).
 *
 * Sürücüler (MEDIA_DRIVER):
 *   bunny  — Bunny Storage API (PUT / DELETE https://<host>/<zone>/<yol>, AccessKey) → MEDIA_PUBLIC_URL/<yol>
 *   local  — sunucu diski (./uploads) + /media statik (CDN yokken geliştirme)
 *   memory — testler
 *
 * @typedef {{ put: (key: string, body: Buffer, contentType: string) => Promise<string>, remove: (key: string) => Promise<void>,
 *   read?: (key: string) => Promise<Buffer>,
 *   url: (key: string) => string, prefix: string, driver: string, files?: Map<string, Buffer> }} Storage
 */

/**
 * @param {import('../config/env').Config} config
 * @param {{ fetch?: typeof fetch, root?: string }} [opts]
 * @returns {Storage}
 */
function createStorage(config, { fetch: f = fetch, root = path.resolve('uploads') } = {}) {
  const prefix = (config.MEDIA_PREFIX || 'app').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const full = (key) => `${prefix}/${key.replace(/^\/+/, '')}`;
  const publicBase = (config.MEDIA_PUBLIC_URL || `${config.PUBLIC_BASE_URL ?? ''}/media`).replace(/\/+$/, '');
  const url = (key) => `${publicBase}/${full(key)}`;
  const driver = config.MEDIA_DRIVER;

  if (driver === 'bunny') {
    const base = `https://${config.BUNNY_STORAGE_HOST}/${encodeURIComponent(config.BUNNY_STORAGE_ZONE)}`;
    const headers = { AccessKey: config.BUNNY_STORAGE_PASSWORD };
    return {
      driver, prefix, url,
      async put(key, body, contentType) {
        const r = await f(`${base}/${full(key)}`, { method: 'PUT', headers: { ...headers, 'Content-Type': contentType },
          body: new Uint8Array(body), signal: AbortSignal.timeout(30_000) });
        if (!r.ok) throw new Error(`CDN yükleme hatası (HTTP ${r.status})`);
        return url(key);
      },
      // Storage API'den (kimlikli) okunur: CDN önbelleğine/eski 404'e takılmaz, özel dosyalar için de çalışır.
      async read(key) {
        const r = await f(`${base}/${full(key)}`, { headers, signal: AbortSignal.timeout(30_000) });
        if (!r.ok) throw new Error(`CDN okuma hatası (HTTP ${r.status})`);
        return Buffer.from(await r.arrayBuffer());
      },
      async remove(key) {
        const r = await f(`${base}/${full(key)}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(15_000) });
        if (!r.ok && r.status !== 404) throw new Error(`CDN silme hatası (HTTP ${r.status})`);
      },
    };
  }

  if (driver === 'memory') {
    /** @type {Map<string, Buffer>} */
    const files = new Map();
    return {
      driver, prefix, url, files,
      async put(key, body) { files.set(full(key), body); return url(key); },
      async read(key) {
        const buf = files.get(full(key));
        if (!buf) throw new Error('Dosya bulunamadı');
        return buf;
      },
      async remove(key) { files.delete(full(key)); },
    };
  }

  // local
  return {
    driver: 'local', prefix, url,
    async put(key, body) {
      const p = path.join(root, full(key));
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, body);
      return url(key);
    },
    async read(key) {
      return fs.readFile(path.join(root, full(key)));
    },
    async remove(key) {
      await fs.rm(path.join(root, full(key)), { force: true });
    },
  };
}

module.exports = { createStorage };
