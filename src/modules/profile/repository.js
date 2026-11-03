'use strict';

/** Düzenlenebilir sütunlar (UPSERT yalnızca gövdede olanları yazar) */
const FIELDS = ['name', 'title', 'phone', 'location', 'description', 'avatar_url'];

/**
 * Yalnızca SQL. Kullanıcıya ait her sorgu user_id = ? ile filtrelenir.
 * @param {import('../../config/db').Db} db
 */
function createProfileRepository(db) {
  return {
    /** @param {string} userId */
    find(userId) {
      return db.one('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
    },

    /**
     * INSERT … ON DUPLICATE KEY UPDATE; yalnızca verilen alanlar güncellenir.
     * @param {string} userId @param {Record<string, string | null>} fields
     */
    async upsert(userId, fields) {
      const keys = FIELDS.filter((k) => k in fields);
      if (!keys.length) return;
      await db.run(
        `INSERT INTO user_profiles (user_id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${keys.map((k) => `${k} = VALUES(${k})`).join(', ')}`,
        [userId, ...keys.map((k) => fields[k])],
      );
    },
  };
}

module.exports = { createProfileRepository, FIELDS };
