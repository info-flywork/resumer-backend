'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const mysql = require('mysql2/promise');

const DIR = path.join(__dirname, 'migrations');
const LOCK = 'app_migrations';

/** @returns {{ file: string, sql: string, checksum: string }[]} */
function migrationFiles(dir = DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3,}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      return { file, sql, checksum: createHash('sha256').update(sql).digest('hex').slice(0, 16) };
    });
}

/**
 * @param {import('mysql2/promise').Connection} conn
 */
async function ensureTable(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(191) NOT NULL PRIMARY KEY,
    checksum CHAR(16) NOT NULL,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

/**
 * Uygulanmamış migration'lar. Uygulanmış bir dosya sonradan değiştirildiyse hata verir.
 * @param {import('mysql2/promise').Connection | import('mysql2/promise').Pool} conn
 * @param {string} [dir]
 */
async function pendingMigrations(conn, dir = DIR) {
  const [tables] = await conn.query("SHOW TABLES LIKE 'schema_migrations'");
  /** @type {Map<string, string>} */
  const applied = new Map();
  if (/** @type {any[]} */ (tables).length) {
    const [rows] = await conn.query('SELECT filename, checksum FROM schema_migrations');
    for (const r of /** @type {any[]} */ (rows)) applied.set(r.filename, r.checksum);
  }
  const files = migrationFiles(dir);
  for (const m of files) {
    const sum = applied.get(m.file);
    if (sum && sum !== m.checksum) {
      throw new Error(`${m.file} uygulandıktan sonra değiştirilmiş. Uygulanmış migration değiştirilmez; yeni dosya ekle.`);
    }
  }
  return files.filter((m) => !applied.has(m.file));
}

/**
 * Bekleyen migration'ları sırayla uygular. Aynı anda iki çalıştırmaya karşı MySQL kilidi alınır.
 * Not: MySQL'de CREATE/ALTER otomatik commit'tir; dosyanın yarısında hata olursa düzeltip kalan
 * kısmı yeni dosyada uygula.
 * @param {{ host: string, port: number, user: string, password: string, database: string }} connOpts
 * @param {{ dir?: string, log?: (msg: string) => void }} [opts]
 */
async function migrate(connOpts, { dir = DIR, log = (m) => process.stdout.write(`${m}\n`) } = {}) {
  const conn = await mysql.createConnection({ ...connOpts, multipleStatements: true, timezone: 'Z', charset: 'utf8mb4' });
  try {
    const [[lock]] = /** @type {any} */ (await conn.query('SELECT GET_LOCK(?, 60) AS ok', [LOCK]));
    if (lock.ok !== 1) throw new Error('Başka bir migration çalışıyor (kilit alınamadı)');
    await conn.query("SET time_zone = '+00:00'");
    await ensureTable(conn);
    const pending = await pendingMigrations(conn, dir);
    for (const m of pending) {
      log(`migration: ${m.file}`);
      await conn.query(m.sql);
      await conn.query('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)', [m.file, m.checksum]);
    }
    log(pending.length ? `✓ ${pending.length} migration uygulandı` : '✓ veritabanı güncel');
    return pending.map((m) => m.file);
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK]).catch(() => {});
    await conn.end();
  }
}

if (require.main === module) {
  const { getConfig } = require('../config/env');
  const c = getConfig();
  migrate({ host: c.DB_HOST, port: c.DB_PORT, user: c.DB_USER, password: c.DB_PASSWORD, database: c.DB_NAME })
    .then(() => process.exit(0))
    .catch((err) => {
      process.stderr.write(`migration başarısız: ${err.message}\n`);
      process.exit(1);
    });
}

module.exports = { migrate, pendingMigrations, migrationFiles };
