'use strict';

const { createCreditsRepository } = require('./repository');

/**
 * Kredi paketi: cüzdan yoksa 3+N ile oluşturulur; ledger 'purchase' (ref = mağaza işlem kimliği).
 * @param {number} amount @param {string} description
 */
function pack(amount, description) {
  return {
    description,
    /** @param {string} userId @param {import('mysql2/promise').PoolConnection} conn @param {import('../../container').Container} deps */
    async grant(userId, conn, deps) {
      const refId = await createCreditsRepository(deps.db).pendingPurchaseTx(userId, `resumer_credits_${amount}`, conn);
      await deps.credits.grantPurchase(userId, amount, refId ? refId.slice(0, 64) : null, conn);
      return { credits: amount };
    },
  };
}

exports.entitlements = ['Resumer Pro'];
exports.consumables = {
  resumer_credits_10: pack(10, '10 AI kredisi'),
  resumer_credits_50: pack(50, '50 AI kredisi'),
};
