'use strict';

const { randomUUID } = require('node:crypto');
const { AppError, notFound } = require('../../core/errors');

/**
 * Uzun işler (yapay zekâ). route.js, `async` işaretli uçları burada iş türü olarak tanımlar; istemci
 * `Prefer: respond-async` gönderirse uç işi kuyruğa yazar, AYNI süreçte hemen başlatır ve 202 döner.
 *
 * İş yeniden çalıştırılmaz: yapay zekâ işleri kredi düşer (refId her çalıştırmada yeni) — süreç çökerse iş
 * 'failed' olur, kullanıcı tekrar dener. Başarısız iş, GET /jobs/:id'de işin KENDİ hatasıyla döner (ör. 403
 * INSUFFICIENT_CREDITS) — istemcinin hata / paywall akışı eşzamanlı uçtaki gibi çalışır.
 *
 * @typedef {(input: any) => Promise<unknown>} TaskFn
 */

const GENERIC = 'İşlem tamamlanamadı, tekrar dene';

/** @param {import('../../container').Container} deps */
function createService(deps) {
  const { db, logger } = deps;
  /** @type {Map<string, TaskFn>} */
  const handlers = new Map();

  /** @param {string} id @param {string} kind @param {any} input */
  async function run(id, kind, input) {
    const claimed = await db.run("UPDATE tasks SET status = 'running' WHERE id = ? AND status = 'queued'", [id]);
    if (!claimed.affectedRows) return;
    try {
      const fn = handlers.get(kind);
      if (!fn) throw new Error(`tanımsız iş türü: ${kind}`);
      const result = await fn(input);
      await db.run("UPDATE tasks SET status = 'done', progress = 100, result = ? WHERE id = ?",
        [JSON.stringify(result ?? null), id]);
    } catch (err) {
      // Beklenen hata (AppError) olduğu gibi saklanır; beklenmeyenin ayrıntısı yalnızca log'a
      const known = err instanceof AppError;
      if (!known || err.status >= 500) logger.error('task_failed', { id, kind, err });
      await db.run(
        "UPDATE tasks SET status = 'failed', error_status = ?, error_code = ?, error = ?, error_details = ? WHERE id = ?",
        [
          known ? err.status : 500,
          known ? err.code : 'TASK_FAILED',
          known ? String(err.message).slice(0, 500) : GENERIC,
          known && err.details != null ? JSON.stringify(err.details) : null,
          id,
        ],
      );
    }
  }

  return {
    /** @param {string} kind @param {TaskFn} fn */
    define(kind, fn) {
      handlers.set(kind, fn);
    },

    /**
     * @param {{ id: string }} user @param {string} kind @param {any} input @param {{ etaS?: number }} [opts]
     * @returns {Promise<{ task_id: string, status: string, eta_s: number | null }>}
     */
    async enqueue(user, kind, input, { etaS } = {}) {
      if (!handlers.has(kind)) throw new Error(`tanımsız iş türü: ${kind}`);
      const id = randomUUID();
      await db.run('INSERT INTO tasks (id, user_id, kind, input, eta_s) VALUES (?, ?, ?, ?, ?)',
        [id, user.id, kind, JSON.stringify(input ?? null), etaS ?? null]);
      setImmediate(() => void run(id, kind, input).catch((err) => logger.error('task_run_failed', { id, err })));
      return { task_id: id, status: 'queued', eta_s: etaS ?? null };
    },

    /**
     * Sürüyor / bitti → durum ve sonuç; başarısız → işin kendi hatası fırlatılır.
     * @param {{ id: string }} user @param {string} id
     */
    async get(user, id) {
      const row = await db.one(
        `SELECT id, status, progress, eta_s, result, error_status, error_code, error, error_details
         FROM tasks WHERE id = ? AND user_id = ?`,
        [id, user.id],
      );
      if (!row) throw notFound('İş bulunamadı');
      if (row.status === 'failed') {
        throw new AppError(row.error_status || 500, row.error_code || 'TASK_FAILED', row.error || GENERIC,
          row.error_details ?? undefined);
      }
      return { id: row.id, status: row.status, progress: row.progress, eta_s: row.eta_s, result: row.result ?? null };
    },

    run,

    /** Worker: süreç çöktüğü için takılan işler başarısız sayılır (yeniden çalıştırılmaz — kredi), eskiler silinir. */
    async cleanup() {
      const stuck = await db.run(
        `UPDATE tasks SET status = 'failed', error_status = 500, error_code = 'TASK_FAILED', error = ?
         WHERE (status = 'running' AND updated_at < UTC_TIMESTAMP(3) - INTERVAL 5 MINUTE)
            OR (status = 'queued' AND updated_at < UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE)`,
        [GENERIC],
      );
      const purged = await db.run('DELETE FROM tasks WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 7 DAY LIMIT 5000');
      return { failed: stuck.affectedRows, purged: purged.affectedRows };
    },
  };
}

module.exports = { createService };
