'use strict';

/**
 * Yalnızca SQL.
 * @param {import('../../config/db').Db} db
 */
function createAiRepository(db) {
  return {
    /**
     * CDN'deyse image boş, storage_key dolu; CDN yoksa görsel veritabanında
     * @param {string} id @param {string} userId @param {string} mime @param {Buffer | null} image @param {string | null} storageKey
     */
    async insertPortrait(id, userId, mime, image, storageKey) {
      await db.run('INSERT INTO ai_portraits (id, user_id, mime, image, storage_key) VALUES (?, ?, ?, ?, ?)',
        [id, userId, mime, image, storageKey]);
    },

    /** Herkese açık sunum: id UUID (tahmin edilemez) @param {string} id */
    findPortrait(id) {
      return db.one('SELECT mime, image, storage_key FROM ai_portraits WHERE id = ?', [id]);
    },

    /** Hesap silinirken CDN'den silinecek dosyalar @param {string} userId */
    async storageKeys(userId) {
      const rows = await db.query('SELECT storage_key FROM ai_portraits WHERE user_id = ? AND storage_key IS NOT NULL', [userId]);
      return rows.map((r) => String(r.storage_key));
    },

    /** Taşıma: veritabanındaki portreler (id sırasıyla, sayfa sayfa) @param {string} afterId @param {number} limit */
    pendingForCdn(afterId, limit) {
      return db.query(
        'SELECT id, mime, image FROM ai_portraits WHERE storage_key IS NULL AND image IS NOT NULL AND id > ? ORDER BY id LIMIT ?',
        [afterId, limit]);
    },

    /** Taşıma: CDN'e yüklenenler (görsel hâlâ veritabanında) @param {string} afterId @param {number} limit */
    uploadedWithBlob(afterId, limit) {
      return db.query(
        'SELECT id, storage_key, LENGTH(image) AS size FROM ai_portraits WHERE storage_key IS NOT NULL AND image IS NOT NULL AND id > ? ORDER BY id LIMIT ?',
        [afterId, limit]);
    },

    /** @param {string} id @param {string} key */
    async setStorageKey(id, key) {
      await db.run('UPDATE ai_portraits SET storage_key = ? WHERE id = ? AND storage_key IS NULL', [key, id]);
    },

    /** Yalnızca CDN'de olduğu doğrulanan portrenin veritabanı kopyası silinir @param {string} id */
    async dropImage(id) {
      await db.run('UPDATE ai_portraits SET image = NULL WHERE id = ? AND storage_key IS NOT NULL', [id]);
    },

    /** Taşıma durumu */
    async cdnStats() {
      return db.one(
        `SELECT COUNT(*) AS total,
                SUM(storage_key IS NULL) AS in_db_only,
                SUM(storage_key IS NOT NULL AND image IS NOT NULL) AS both_copies,
                SUM(storage_key IS NOT NULL AND image IS NULL) AS cdn_only,
                COALESCE(SUM(LENGTH(image)), 0) AS db_bytes
         FROM ai_portraits`);
    },

    /** Giriş sağlayıcısının fotoğrafı (user_profiles okunmaz) @param {string} userId */
    async userPhotoUrl(userId) {
      const r = await db.one('SELECT photo_url FROM users WHERE id = ?', [userId]);
      return r?.photo_url ? String(r.photo_url) : null;
    },
  };
}

module.exports = { createAiRepository };
