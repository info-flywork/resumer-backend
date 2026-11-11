'use strict';

const { forbidden } = require('../../core/errors');
const { isDuplicate } = require('../../config/db');

const PRO = 'Resumer Pro';

/**
 * AI erişimi: Resumer Pro → sınırsız. Ücretsiz kullanıcı → TÜM AI özellikleri (analiz, tailor, çeviri,
 * portre) için toplam 1 deneme. Deneme `ai_trial_uses` satırıdır (user_id birincil anahtar → aynı anda iki
 * istek gelse de yalnızca biri geçer). Başarısız işlemde satır silinir, deneme geri gelir.
 * register.js bu fabrikayı `deps.plan` olarak kaydeder.
 * @param {import('../../container').Container} deps
 */
function createService(deps) {
  const { db } = deps;

  /** @param {{ id: string }} user */
  const isPro = (user) => deps.entitlements.isActive(user.id, PRO);

  /** @param {{ id: string }} user @returns {Promise<boolean>} */
  async function hasFreeTrial(user) {
    const row = await db.one('SELECT 1 AS ok FROM ai_trial_uses WHERE user_id = ?', [user.id]);
    return !row;
  }

  return {
    isPro,
    hasFreeTrial,

    /**
     * AI işleminden önce çağrılır. Pro ise serbest; değilse ücretsiz denemeyi kullanır, deneme bittiyse
     * 403 PREMIUM_REQUIRED (istemci paywall açar).
     * @param {{ id: string }} user @param {string} reason @param {string} refId
     */
    async consumeAi(user, reason, refId) {
      if (deps.config.DEV_UNLIMITED || (await isPro(user))) return;
      try {
        await db.run('INSERT INTO ai_trial_uses (user_id, reason, ref_id) VALUES (?, ?, ?)', [user.id, reason, refId]);
      } catch (err) {
        if (isDuplicate(err)) throw forbidden('Bu özellik Pro üyelere açık', 'PREMIUM_REQUIRED');
        throw err;
      }
    },

    /**
     * İşlem başarısız → bu işlemle kullanılan deneme geri verilir (Pro kullanıcıda satır yok, etkisiz).
     * @param {{ id: string }} user @param {string} refId
     */
    async refundAi(user, refId) {
      await db.run('DELETE FROM ai_trial_uses WHERE user_id = ? AND ref_id = ?', [user.id, refId]);
    },

    /**
     * GET /me/plan
     * @param {{ id: string, locale?: string }} user
     */
    async getPlan(user) {
      const [list, freeTrial] = await Promise.all([deps.entitlements.list(user.id), hasFreeTrial(user)]);
      const pro = list.find((e) => e.entitlement === PRO);
      const renews = pro?.expires_at
        ? new Intl.DateTimeFormat(user.locale || 'en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(pro.expires_at))
        : '';
      return { name: pro ? PRO : 'Free', renews_on: renews, is_active: Boolean(pro), free_trial_available: !pro && freeTrial };
    },
  };
}

module.exports = { createService, PRO };
