'use strict';

const mysql = require('mysql2/promise');

/**
 * @typedef {import('mysql2/promise').PoolConnection | import('mysql2/promise').Pool} Executor
 * @typedef {{
 *   pool: import('mysql2/promise').Pool,
 *   query: <T = any>(sql: string, params?: unknown[], exec?: Executor) => Promise<T[]>,
 *   one: <T = any>(sql: string, params?: unknown[], exec?: Executor) => Promise<T | null>,
 *   run: (sql: string, params?: unknown[], exec?: Executor) => Promise<{ affectedRows: number, insertId: number }>,
 *   tx: <T>(fn: (conn: import('mysql2/promise').PoolConnection) => Promise<T>) => Promise<T>,
 *   health: () => Promise<{ ok: boolean, latencyMs: number, error?: string }>,
 *   close: () => Promise<void>,
 * }} Db
 */

/**
 * MySQL bağlantı havuzu. Tüm SQL parametreli yazılır (`?`); değer asla metne eklenmez.
 * `pool.query` istemci tarafında güvenli kaçış yapar (LIMIT ? dahil her yerde çalışır).
 * Saatler UTC tutulur ve okunur.
 * @param {{ DB_HOST: string, DB_PORT: number, DB_NAME: string, DB_USER: string, DB_PASSWORD: string, DB_CONNECTION_LIMIT: number }} config
 * @returns {Db}
 */
function createDb(config) {
  const pool = mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    connectionLimit: config.DB_CONNECTION_LIMIT,
    waitForConnections: true,
    queueLimit: 100,
    enableKeepAlive: true,
    timezone: 'Z',
    charset: 'utf8mb4',
    supportBigNumbers: true,
    // JSON sütunları nesne olarak gelsin
    typeCast(field, next) {
      if (field.type === 'JSON') {
        const raw = field.string('utf8');
        return raw == null ? null : JSON.parse(raw);
      }
      if (field.type === 'TINY' && field.length === 1) {
        const v = field.string();
        return v == null ? null : v === '1';
      }
      return next();
    },
  });
  pool.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });

  /** @type {Db['query']} */
  async function query(sql, params = [], exec = pool) {
    const [rows] = await exec.query(sql, params);
    return /** @type {any} */ (rows);
  }

  /** @type {Db['one']} */
  async function one(sql, params = [], exec = pool) {
    const rows = await query(sql, params, exec);
    return rows[0] ?? null;
  }

  /** @type {Db['run']} */
  async function run(sql, params = [], exec = pool) {
    const [result] = await exec.query(sql, params);
    const r = /** @type {any} */ (result);
    return { affectedRows: r.affectedRows ?? 0, insertId: r.insertId ?? 0 };
  }

  /** @type {Db['tx']} */
  async function tx(fn) {
    // Eşzamanlı istekler InnoDB'de kilitlenebilir (ER_LOCK_DEADLOCK); MySQL kurbanı geri alır → işlemi yeniden dene
    for (let attempt = 0; ; attempt += 1) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback().catch(() => {});
        if (/** @type {any} */ (err)?.code === 'ER_LOCK_DEADLOCK' && attempt < 4) continue;
        throw err;
      } finally {
        conn.release();
      }
    }
  }

  async function health() {
    const started = Date.now();
    try {
      await pool.query('SELECT 1');
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, error: /** @type {Error} */ (err).message };
    }
  }

  return { pool, query, one, run, tx, health, close: () => pool.end() };
}

/** MySQL tekil anahtar ihlali mi? (ör. aynı kullanıcı adı) */
function isDuplicate(err) {
  return Boolean(err && /** @type {any} */ (err).code === 'ER_DUP_ENTRY');
}

module.exports = { createDb, isDuplicate };
