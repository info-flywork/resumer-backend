'use strict';

/**
 * Yalnızca SQL. Kendi tablosu yok; analyses (analyses modülü) ve cvs satırlarına dokunur.
 * @param {import('../../config/db').Db} db
 */
function createCvBuilderRepository(db) {
  return {
    /**
     * CV hiç analiz edilmiş mi? analyses tablosu henüz yoksa (modül kurulu değil) false.
     * @param {string} userId @param {string} cvId
     */
    async hasAnalysis(userId, cvId) {
      try {
        return Boolean(await db.one('SELECT 1 AS ok FROM analyses WHERE user_id = ? AND cv_id = ? LIMIT 1', [userId, cvId]));
      } catch (e) {
        if (/** @type {any} */ (e)?.code === 'ER_NO_SUCH_TABLE') return false;
        throw e;
      }
    },

    /** @param {string} userId @param {string} cvId @param {string} subtitle */
    setSubtitle(userId, cvId, subtitle) {
      return db.run('UPDATE cvs SET subtitle = ? WHERE id = ? AND user_id = ?', [subtitle, cvId, userId]);
    },
  };
}

module.exports = { createCvBuilderRepository };
