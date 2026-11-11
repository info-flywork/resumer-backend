'use strict';

const { createProfileRepository, FIELDS } = require('./repository');

const PRO = 'Resumer Pro';

/** Kırpılmış metin; boş ve null → null (temizle) @param {string | null | undefined} v */
const clean = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * Profil (/me) ve CV istatistikleri. register.js bu fabrikayı `deps.profile` olarak kaydeder.
 * @param {import('../../container').Container} deps
 */
function createService(deps) {
  const repo = createProfileRepository(deps.db);

  /** Sayaçlar — /me.stats ile /cvs/stats aynı kaynaktan @param {{ id: string }} user */
  async function counts(user) {
    const c = await deps.cvs.counts(user.id);
    // Analizler: Analizler sekmesindeki satır sayısı (skoru olan CV), ham analiz kaydı değil
    return { cvs: c.total, tailored: c.tailored, analyses: c.analyzed };
  }

  /** @param {import('../auth/repository').UserRow} user */
  async function get(user) {
    const [p, isPro, credits, stats] = await Promise.all([
      repo.find(user.id),
      deps.entitlements.isActive(user.id, PRO),
      deps.credits.getBalance(user),
      counts(user),
    ]);
    return {
      name: p?.name ?? user.display_name ?? '',
      email: user.email ?? '',
      title: p?.title ?? '',
      phone: p?.phone ?? user.phone ?? '',
      location: p?.location ?? '',
      description: p?.description ?? '',
      avatar_url: p?.avatar_url ?? user.photo_url ?? null,
      is_pro: isPro,
      credits: Number(credits),
      stats,
    };
  }

  return {
    get,

    /**
     * Gövdede anahtarı olan alanlar yazılır; diğerleri değişmez.
     * @param {import('../auth/repository').UserRow} user @param {Record<string, any>} body
     */
    async update(user, body) {
      /** @type {Record<string, string | null>} */
      const fields = {};
      for (const k of FIELDS) if (k in body) fields[k] = clean(body[k]);
      await repo.upsert(user.id, fields);
      return get(user);
    },

    /** Hesap silme şablona devredilir (BE-5); veriyi burada silmeyiz @param {import('../auth/repository').UserRow} user */
    async remove(user) {
      await deps.account.requestDeletion(user);
      return null;
    },

    /** @param {import('../auth/repository').UserRow} user */
    async cvStats(user) {
      const s = await counts(user);
      return { total: s.cvs, tailored: s.tailored, analyses: s.analyses };
    },
  };
}

module.exports = { createService };
