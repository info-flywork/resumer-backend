'use strict';

const { render } = require('./templates');

/** Yeniden deneme aralıkları (sn): 1 dk, 5 dk, 30 dk, 2 sa → sonra "failed" */
const BACKOFF = [60, 300, 1800, 7200];

/**
 * Push bildirimleri: istek içinde GÖNDERİLMEZ, kuyruğa (push_outbox) yazılır; worker gönderir.
 * Böylece istek hızlı kalır, OneSignal kesintisinde bildirim kaybolmaz, aynı transaction içinde
 * yazılabilir (veri kaydedilmediyse bildirim de gitmez).
 * Yerel bildirimler (hatırlatıcı vb.) istemcide flutter_local_notifications ile kurulur — sunucu yok.
 * @param {import('../../container').Container} deps
 */
function createNotificationService(deps) {
  const { db, logger } = deps;

  return {
    /**
     * @param {string} userId
     * @param {string} template templates.js anahtarı
     * @param {Record<string, unknown>} [params]
     * @param {{ data?: Record<string, unknown>, collapseId?: string, conn?: import('mysql2/promise').PoolConnection }} [opts]
     */
    async notify(userId, template, params = {}, opts = {}) {
      await db.run(
        'INSERT INTO push_outbox (user_id, template, params, data, collapse_id) VALUES (?, ?, ?, ?, ?)',
        [userId, template, JSON.stringify(params), opts.data ? JSON.stringify(opts.data) : null, opts.collapseId ?? null],
        opts.conn,
      );
    },

    /** Worker: zamanı gelen bildirimleri gönderir. @param {number} [batch] */
    async processOutbox(batch = 50) {
      const rows = await db.tx(async (conn) => {
        const [due] = await conn.query(
          `SELECT o.*, u.locale FROM push_outbox o JOIN users u ON u.id = o.user_id
           WHERE o.status = 'pending' AND o.next_attempt_at <= UTC_TIMESTAMP(3)
           ORDER BY o.id LIMIT ? FOR UPDATE SKIP LOCKED`,
          [batch],
        );
        const list = /** @type {any[]} */ (due);
        if (list.length) {
          // Kilidi bırakmadan önce "işleniyor" say: başka worker aynı satırı almaz
          await conn.query(
            `UPDATE push_outbox SET attempts = attempts + 1, next_attempt_at = UTC_TIMESTAMP(3) + INTERVAL 10 MINUTE WHERE id IN (?)`,
            [list.map((r) => r.id)],
          );
        }
        return list;
      });

      const stats = { sent: 0, skipped: 0, retry: 0, failed: 0 };
      for (const row of rows) {
        const text = render(row.template, row.locale, row.params || {});
        if (!text || !deps.oneSignal.enabled) {
          await db.run(`UPDATE push_outbox SET status = 'skipped', last_error = ? WHERE id = ?`, [
            text ? 'onesignal_not_configured' : `unknown_template:${row.template}`,
            row.id,
          ]);
          stats.skipped += 1;
          continue;
        }
        try {
          const r = await deps.oneSignal.send({ userId: row.user_id, ...text, data: row.data, collapseId: row.collapse_id });
          await db.run(
            `UPDATE push_outbox SET status = ?, sent_at = UTC_TIMESTAMP(3), last_error = ? WHERE id = ?`,
            [r.delivered ? 'sent' : 'skipped', r.delivered ? null : r.reason ?? null, row.id],
          );
          r.delivered ? (stats.sent += 1) : (stats.skipped += 1);
        } catch (err) {
          const attempt = row.attempts + 1; // bu deneme
          const retryable = /** @type {any} */ (err).retryable !== false && attempt <= BACKOFF.length;
          await db.run(
            `UPDATE push_outbox SET status = ?, last_error = ?, next_attempt_at = UTC_TIMESTAMP(3) + INTERVAL ? SECOND WHERE id = ?`,
            [retryable ? 'pending' : 'failed', String(/** @type {Error} */ (err).message).slice(0, 500), BACKOFF[attempt - 1] ?? 0, row.id],
          );
          retryable ? (stats.retry += 1) : (stats.failed += 1);
          logger.warn('push_send_failed', { outboxId: row.id, attempt, retryable, err });
        }
      }
      return stats;
    },
  };
}

module.exports = { createNotificationService, BACKOFF };
