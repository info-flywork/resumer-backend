'use strict';

const { randomUUID } = require('node:crypto');

/**
 * Yalnızca SQL. Kullanıcıya ait her sorgu user_id = ? ile filtrelenir. `conn` verilirse işlem içinde çalışır.
 * @param {import('../../config/db').Db} db
 */
function createAnalysesRepository(db) {
  return {
    /**
     * Analiz + önerileri (tek transaction'da çağrılır). Önerilere yeni kimlik atanır.
     * @param {string} userId
     * @param {{ id: string, cv_id: string | null, source: 'cv' | 'linkedin', source_label: string | null, overall_score: number, section_scores: any[], ats: any }} a
     * @param {{ title: string, description: string, priority: string, target_section: string, suggested_text: string | null }[]} recs
     * @param {import('../../config/db').Executor} conn
     * @returns {Promise<string[]>} öneri kimlikleri (sıraya göre)
     */
    async insert(userId, a, recs, conn) {
      await db.run(
        `INSERT INTO analyses (id, user_id, cv_id, source, source_label, overall_score, section_scores, ats)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, userId, a.cv_id, a.source, a.source_label, a.overall_score, JSON.stringify(a.section_scores), JSON.stringify(a.ats)],
        conn,
      );
      /** @type {string[]} */
      const ids = [];
      for (const [i, r] of recs.entries()) {
        const id = randomUUID();
        ids.push(id);
        await db.run(
          `INSERT INTO analysis_recommendations
             (id, analysis_id, user_id, position, title, description, priority, target_section, suggested_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, a.id, userId, i, r.title, r.description, r.priority, r.target_section, r.suggested_text],
          conn,
        );
      }
      return ids;
    },

    /** Öneri + bağlı analizin cv_id'si @param {string} userId @param {string} id */
    findRecommendation(userId, id) {
      return db.one(
        `SELECT r.*, a.cv_id FROM analysis_recommendations r
         JOIN analyses a ON a.id = r.analysis_id
         WHERE r.id = ? AND r.user_id = ?`,
        [id, userId],
      );
    },

    /** Uygulandı işareti; zaten uygulanmışsa false @param {string} userId @param {string} id @param {import('../../config/db').Executor} conn */
    async markApplied(userId, id, conn) {
      const r = await db.run(
        'UPDATE analysis_recommendations SET applied_at = UTC_TIMESTAMP(3) WHERE id = ? AND user_id = ? AND applied_at IS NULL',
        [id, userId],
        conn,
      );
      return r.affectedRows > 0;
    },

    /** @param {string} userId */
    async countByUser(userId) {
      const r = await db.one('SELECT COUNT(*) AS n FROM analyses WHERE user_id = ?', [userId]);
      return Number(r?.n ?? 0);
    },

    /** @param {string} cvId */
    async hasForCv(cvId) {
      return Boolean(await db.one('SELECT 1 AS ok FROM analyses WHERE cv_id = ? LIMIT 1', [cvId]));
    },
  };
}

module.exports = { createAnalysesRepository };
