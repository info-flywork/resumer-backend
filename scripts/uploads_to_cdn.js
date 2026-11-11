'use strict';

/**
 * Yerel diskteki (./uploads/<MEDIA_PREFIX>/…) dosyaları Bunny CDN'e aynı anahtarla taşır. Veritabanındaki
 * anahtarlar (ör. cvs/<user>/<cv>.pdf) değişmez; sürücü bunny olunca aynı anahtar CDN'den okunur.
 * Tekrar çalıştırılabilir; yerel dosyaları SİLMEZ (doğruladıktan sonra elle silinebilir).
 *
 *   node scripts/uploads_to_cdn.js            ne yükleneceğini listeler
 *   node scripts/uploads_to_cdn.js --upload   yükler ve CDN'den geri okuyup boyutu doğrular
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { getConfig } = require('../src/config/env');
const { createStorage } = require('../src/core/storage');

const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword' };

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.isFile() && !e.name.startsWith('.')) out.push(p);
  }
  return out;
}

async function main() {
  const upload = process.argv[2] === '--upload';
  const config = getConfig();
  const storage = createStorage(config);
  const root = path.resolve('uploads', storage.prefix);
  const files = await walk(root);
  console.log(`${files.length} dosya: ${root}`);
  if (!upload) {
    for (const f of files) console.log('  ', path.relative(root, f));
    return;
  }
  if (storage.driver !== 'bunny') throw new Error('MEDIA_DRIVER=bunny değil — CDN ayarları eksik');
  let ok = 0;
  for (const f of files) {
    const key = path.relative(root, f).split(path.sep).join('/');
    const body = await fs.readFile(f);
    await storage.put(key, body, MIME[path.extname(f).toLowerCase()] ?? 'application/octet-stream');
    const back = await storage.read?.(key);
    if (!back || back.length !== body.length) throw new Error(`Doğrulama başarısız: ${key}`);
    ok++;
    console.log('  ✓', key);
  }
  console.log(`${ok}/${files.length} dosya CDN'e yüklendi ve doğrulandı.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
