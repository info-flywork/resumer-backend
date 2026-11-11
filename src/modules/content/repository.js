'use strict';

/**
 * Yalnızca SQL. Sabit içerik herkese ortaktır; kullanıcıya bağlı satır yok.
 * @param {import('../../config/db').Db} db
 */
function createContentRepository(db) {
  return {
    // Katalog küçük (onlarca satır); üst sınır yalnızca güvenlik payı. 50'de kalırsa yeni şablonlar
    // eklendikçe listenin sonu sessizce kesilir.
    listTemplates() {
      return db.query('SELECT * FROM cv_templates WHERE is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 500');
    },

    /** @param {string} id */
    findTemplate(id) {
      return db.one('SELECT id, is_premium FROM cv_templates WHERE id = ? AND is_active = 1', [id]);
    },

    /** @param {string} locale */
    listFaq(locale) {
      return db.query('SELECT id, question, answer FROM faqs WHERE locale = ? AND is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 100', [
        locale,
      ]);
    },
  };
}

module.exports = { createContentRepository };
