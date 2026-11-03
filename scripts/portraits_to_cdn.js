'use strict';

/**
 * Eski AI portrelerini veritabanından Bunny CDN'e taşır. Üç adım, her biri ayrı çalıştırılır; her adım
 * tekrar çalıştırılabilir (yarıda kalırsa kaldığı yerden devam eder) ve hiçbir adım görseli kaybettirmez.
 *
 *   node scripts/portraits_to_cdn.js            durum: kaç portre nerede, veritabanında ne kadar yer kaplıyor
 *   node scripts/portraits_to_cdn.js --upload   CDN'e yükler, CDN'den geri okuyup boyutu doğrular, kaydı işaretler.
 *                                               Görsel veritabanında KALIR (eski adres artık CDN'e yönlendirir).
 *   node scripts/portraits_to_cdn.js --drop-db-copies
 *                                               CDN'de olduğu yeniden doğrulanan portrelerin veritabanı kopyasını
 *                                               siler. Yalnızca --upload'dan sonra ve uygulamada portreler
 *                                               sorunsuz görünüyorsa.
 *
 * Gerekli: MEDIA_DRIVER=bunny ve BUNNY_* / MEDIA_PUBLIC_URL ayarları (sunucunun ortamı).
 */
const { getConfig } = require('../src/config/env');
const { createDb } = require('../src/config/db');
const { createStorage } = require('../src/core/storage');
const { createAiRepository } = require('../src/modules/ai/repository');
const { portraitKey } = require('../src/modules/ai/service');

const BATCH = 20;

/** CDN'deki dosya beklenen boyutta mı (HEAD) @param {string} url @param {number} size */
async function onCdn(url, size) {
  const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
  return r.ok && Number(r.headers.get('content-length')) === size;
}

async function main() {
  const mode = process.argv[2] ?? '';
  const config = getConfig();
  const db = createDb(config);
  const repo = createAiRepository(db);
  try {
    if (mode === '--upload' || mode === '--drop-db-copies') {
      if (config.MEDIA_DRIVER !== 'bunny') throw new Error('MEDIA_DRIVER=bunny değil — CDN ayarları eksik');
    }
    const storage = createStorage(config);

    if (mode === '--upload') {
      let after = '';
      let done = 0;
      let failed = 0;
      for (;;) {
        const rows = await repo.pendingForCdn(after, BATCH);
        if (!rows.length) break;
        for (const row of rows) {
          after = String(row.id);
          const key = portraitKey(after);
          const image = /** @type {Buffer} */ (row.image);
          try {
            const url = await storage.put(key, image, String(row.mime));
            if (!(await onCdn(url, image.length))) throw new Error('CDN doğrulaması tutmadı');
            await repo.setStorageKey(after, key);
            done += 1;
          } catch (err) {
            failed += 1;
            console.error(`  ✗ ${after}: ${/** @type {Error} */ (err).message}`);
          }
        }
        console.log(`  yüklendi ${done}, hata ${failed}`);
      }
      console.log(`bitti: ${done} portre CDN'de (veritabanı kopyası duruyor), ${failed} hata (tekrar çalıştır)`);
    } else if (mode === '--drop-db-copies') {
      let after = '';
      let dropped = 0;
      let skipped = 0;
      for (;;) {
        const rows = await repo.uploadedWithBlob(after, BATCH);
        if (!rows.length) break;
        for (const row of rows) {
          after = String(row.id);
          if (await onCdn(storage.url(String(row.storage_key)), Number(row.size))) {
            await repo.dropImage(after);
            dropped += 1;
          } else {
            skipped += 1;
            console.error(`  ! ${after}: CDN'de bulunamadı / boyut farklı — veritabanı kopyası korundu`);
          }
        }
      }
      console.log(`bitti: ${dropped} veritabanı kopyası silindi, ${skipped} korundu. Disk alanını geri almak için ` +
        '(isteğe bağlı, yoğun olmayan saatte): OPTIMIZE TABLE ai_portraits;');
    } else if (mode !== '') {
      throw new Error(`bilinmeyen seçenek: ${mode}`);
    }

    const s = await repo.cdnStats();
    console.log(`durum: toplam ${s.total} | yalnızca veritabanında ${Number(s.in_db_only)} | ikisinde de ` +
      `${Number(s.both_copies)} | yalnızca CDN'de ${Number(s.cdn_only)} | veritabanında ` +
      `${(Number(s.db_bytes) / 1024 / 1024).toFixed(1)} MB`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
