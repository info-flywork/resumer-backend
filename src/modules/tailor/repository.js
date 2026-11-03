'use strict';

const { randomUUID } = require('node:crypto');

/**
 * Yalnızca SQL. Her sorgu kullanıcıya göre filtrelenir (user_id = ?). `conn` verilirse işlem içinde çalışır.
 * @param {import('../../config/db').Db} db
 */
function createTailorRepository(db) {
  return {
    newId: () => randomUUID(),

    /**
     * @param {string} id @param {string} userId
     * @param {{ cv_id: string, job_url: string, job_title: string, company: string, current_score: number, suggestions: any[] }} d
     */
    async create(id, userId, d) {
      await db.run(
        `INSERT INTO tailor_sessions (id, user_id, cv_id, job_url, job_title, company, current_score, suggestions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, d.cv_id, d.job_url, d.job_title, d.company, d.current_score, JSON.stringify(d.suggestions)],
      );
    },

    /**
     * Son 24 saatteki en yeni oturum (durum izin listesinden).
     * @param {string} userId @param {string[]} statuses @param {import('../../config/db').Executor} [conn] @param {boolean} [lock]
     */
    latest(userId, statuses, conn, lock = false) {
      const list = statuses.filter((s) => s === 'analyzed' || s === 'applied' || s === 'saved');
      if (!list.length) return Promise.resolve(null);
      return db.one(
        `SELECT * FROM tailor_sessions
         WHERE user_id = ? AND status IN (${list.map(() => '?').join(', ')})
           AND created_at >= UTC_TIMESTAMP(3) - INTERVAL 24 HOUR
         ORDER BY created_at DESC, id DESC LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [userId, ...list],
        conn,
      );
    },

    /** @param {string} userId @param {string} id @param {{ ids: string[], content: any, score: number }} d */
    async markApplied(userId, id, d) {
      await db.run(
        "UPDATE tailor_sessions SET applied_ids = ?, applied_content = ?, new_score = ?, status = 'applied' WHERE id = ? AND user_id = ?",
        [JSON.stringify(d.ids), JSON.stringify(d.content), d.score, id, userId],
      );
    },

    /** @param {string} userId @param {string} id @param {string} cvId @param {import('../../config/db').Executor} conn */
    async markSaved(userId, id, cvId, conn) {
      await db.run("UPDATE tailor_sessions SET status = 'saved', saved_cv_id = ? WHERE id = ? AND user_id = ?", [cvId, id, userId], conn);
    },

    /** 7 günden eski oturumları siler; silinen satır sayısı */
    async purgeOld() {
      const r = await db.run('DELETE FROM tailor_sessions WHERE created_at < UTC_TIMESTAMP(3) - INTERVAL 7 DAY');
      return r.affectedRows;
    },
  };
}

module.exports = { createTailorRepository };
