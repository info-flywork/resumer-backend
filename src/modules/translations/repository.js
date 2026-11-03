'use strict';

/**
 * Yalnızca SQL. CV okuma / yazma `deps.cvs` üzerinden yapılır; burada yalnızca dil etiketi güncellenir.
 * @param {import('../../config/db').Db} db
 */
function createTranslationsRepository(db) {
  return {
    /** Kaynak CV'nin dili boşsa tespit edilen dille doldurur @param {string} userId @param {string} cvId @param {string} language */
    setLanguageIfEmpty(userId, cvId, language) {
      return db.run('UPDATE cvs SET language = ? WHERE id = ? AND user_id = ? AND language IS NULL', [language, cvId, userId]);
    },
  };
}

module.exports = { createTranslationsRepository };
