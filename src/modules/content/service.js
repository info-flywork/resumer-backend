'use strict';

const { createContentRepository } = require('./repository');

/** Yedek dil: istenen dilde aktif satır yoksa buna düşülür */
const FALLBACK_LOCALE = 'en';

/**
 * "tr-TR" / "tr_TR" / "tr,en;q=0.9" → "tr" (ilk 2 harf, küçük)
 * @param {string | null | undefined} raw
 */
function normalizeLocale(raw) {
  const m = /^\s*([a-zA-Z]{2})/.exec(raw ?? '');
  return m ? m[1].toLowerCase() : FALLBACK_LOCALE;
}

/**
 * Sabit içerik (şablonlar, SSS). register.js bu fabrikayı `deps.content` olarak kaydeder.
 * @param {import('../../container').Container} deps
 */
function createService(deps) {
  const repo = createContentRepository(deps.db);

  return {
    async listTemplates() {
      const rows = await repo.listTemplates();
      return {
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          description: r.description,
          image: r.image,
          is_premium: Boolean(r.is_premium),
        })),
      };
    },

    /** @param {string | null | undefined} rawLocale kullanıcı dili ya da Accept-Language */
    async listFaq(rawLocale) {
      const locale = normalizeLocale(rawLocale);
      let rows = await repo.listFaq(locale);
      if (!rows.length && locale !== FALLBACK_LOCALE) rows = await repo.listFaq(FALLBACK_LOCALE);
      return { items: rows.map((r) => ({ id: r.id, question: r.question, answer: r.answer })) };
    },

    /**
     * cv_builder premium şablon kontrolü için.
     * @param {string} id
     * @returns {Promise<{ id: string, is_premium: boolean } | null>}
     */
    async getTemplate(id) {
      const row = await repo.findTemplate(id);
      return row ? { id: row.id, is_premium: Boolean(row.is_premium) } : null;
    },
  };
}

module.exports = { createService, normalizeLocale };
