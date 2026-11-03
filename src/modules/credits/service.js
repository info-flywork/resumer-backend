'use strict';

const { forbidden } = require('../../core/errors');
const { createCreditsRepository } = require('./repository');

/** Özelliklerin kredi maliyeti (sabit) */
const COSTS = { analysis: 1, tailor: 1, translation: 1, portrait: 1 };
const WELCOME_CREDITS = 3;
const PRO_MONTHLY_CREDITS = 30;
const REFILL_INTERVAL_MS = 30 * 24 * 3600 * 1000;
const PRO = 'Resumer Pro';

/**
 * Cüzdan işlemleri tek transaction + SELECT … FOR UPDATE ile yapılır (çift harcama olmaz).
 * register.js bu fabrikayı `deps.credits` olarak kaydeder.
 * @param {import('../../container').Container} deps
 */
function createService(deps) {
  const { db } = deps;
  const repo = createCreditsRepository(db);

  /**
   * Cüzdanı garanti eder (yoksa 3 kredi + 'welcome') ve kilitleyerek okur.
   * @param {string} userId @param {import('../../config/db').Executor} conn
   */
  async function ensureWallet(userId, conn) {
    if (await repo.insertWallet(userId, WELCOME_CREDITS, conn)) {
      await repo.addLedger(userId, WELCOME_CREDITS, 'welcome', null, WELCOME_CREDITS, conn);
    }
    return /** @type {{ credits: number, last_refill_at: Date | null }} */ (await repo.lockWallet(userId, conn));
  }

  /** @param {{ id: string }} user @param {boolean} premium @param {import('../../config/db').Executor} conn */
  /** @param {{ last_refill_at: Date | null }} w */
  function refillDue(w) {
    return !w.last_refill_at || Date.now() - new Date(w.last_refill_at).getTime() >= REFILL_INTERVAL_MS;
  }

  async function balanceIn(user, premium, conn) {
    const w = await ensureWallet(user.id, conn);
    let credits = Number(w.credits);
    if (premium && refillDue(w)) {
      const next = Math.max(credits, PRO_MONTHLY_CREDITS);
      await repo.setCredits(user.id, next, true, conn);
      if (next !== credits) await repo.addLedger(user.id, next - credits, 'monthly_refill', null, next, conn);
      credits = next;
    }
    return credits;
  }

  /**
   * Bakiye; premium ise aylık yenilemeyi de tetikler.
   * @param {{ id: string }} user @param {import('../../config/db').Executor} [conn] verilirse o transaction'da çalışır
   * @returns {Promise<number>}
   */
  async function getBalance(user, conn) {
    const premium = await deps.entitlements.isActive(user.id, PRO);
    if (conn) return balanceIn(user, premium, conn);
    // Görüntüleme (GET /me, /me/plan): cüzdan varsa ve yenileme gerekmiyorsa kilitsiz tek SELECT;
    // yalnızca ilk kez (cüzdan yok) ya da aylık yenileme zamanı yazma işlemi açılır
    const w = await repo.readWallet(user.id);
    if (w && !(premium && refillDue(w))) return Number(w.credits);
    return db.tx((c) => balanceIn(user, premium, c));
  }

  return {
    getBalance,

    /**
     * Kredi harcar; yetmezse 403 INSUFFICIENT_CREDITS. Kalan bakiyeyi döner.
     * @param {{ id: string }} user @param {number} amount @param {string} reason @param {string | null} refId
     */
    consume(user, amount, reason, refId) {
      return db.tx(async (conn) => {
        const w = await ensureWallet(user.id, conn);
        if (Number(w.credits) < amount) throw forbidden('Yeterli AI kredin yok', 'INSUFFICIENT_CREDITS');
        const left = Number(w.credits) - amount;
        await repo.setCredits(user.id, left, false, conn);
        await repo.addLedger(user.id, -amount, reason, refId ?? null, left, conn);
        return left;
      });
    },

    /**
     * Başarısız işlemde krediyi iade eder; aynı refId için ikinci iade yapılmaz. Güncel bakiyeyi döner.
     * @param {{ id: string }} user @param {number} amount @param {string} refId
     */
    refund(user, amount, refId) {
      return db.tx(async (conn) => {
        const w = await ensureWallet(user.id, conn);
        if (await repo.hasLedger(user.id, 'refund', refId, conn)) return Number(w.credits);
        const next = Number(w.credits) + amount;
        await repo.setCredits(user.id, next, false, conn);
        await repo.addLedger(user.id, amount, 'refund', refId, next, conn);
        return next;
      });
    },

    /**
     * Kredi paketi satın alımı: çağıranın transaction'ında cüzdana ekler (products.js kullanır).
     * @param {string} userId @param {number} amount @param {string | null} refId @param {import('../../config/db').Executor} conn
     */
    async grantPurchase(userId, amount, refId, conn) {
      const w = await ensureWallet(userId, conn);
      const next = Number(w.credits) + amount;
      await repo.setCredits(userId, next, false, conn);
      await repo.addLedger(userId, amount, 'purchase', refId, next, conn);
    },

    /**
     * GET /me/plan
     * @param {{ id: string, locale?: string }} user
     */
    async getPlan(user) {
      const credits = await getBalance(user);
      const list = await deps.entitlements.list(user.id);
      const pro = list.find((e) => e.entitlement === PRO);
      const renews = pro?.expires_at
        ? new Intl.DateTimeFormat(user.locale || 'en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(pro.expires_at))
        : '';
      return { name: pro ? PRO : 'Free', credits, renews_on: renews, is_active: Boolean(pro) };
    },
  };
}

module.exports = { createService, COSTS, WELCOME_CREDITS, PRO_MONTHLY_CREDITS };
