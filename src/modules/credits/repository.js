'use strict';

const { randomUUID } = require('node:crypto');

/**
 * Yalnızca SQL. Her sorgu user_id ile filtrelenir; `conn` çağıranın transaction'ıdır.
 * @param {import('../../config/db').Db} db
 */
function createCreditsRepository(db) {
  return {
    /**
     * Cüzdan yoksa oluşturur (yarışa karşı INSERT IGNORE) → oluşturuldu mu
     * @param {string} userId @param {number} initial @param {import('../../config/db').Executor} conn
     */
    async insertWallet(userId, initial, conn) {
      const r = await db.run('INSERT IGNORE INTO user_wallets (user_id, credits) VALUES (?, ?)', [userId, initial], conn);
      return r.affectedRows > 0;
    },

    /** Cüzdanı kilitsiz okur (yalnızca görüntüleme) @param {string} userId */
    readWallet(userId) {
      return db.one('SELECT credits, last_refill_at FROM user_wallets WHERE user_id = ?', [userId]);
    },

    /** Cüzdan satırını kilitleyerek okur @param {string} userId @param {import('../../config/db').Executor} conn */
    lockWallet(userId, conn) {
      return db.one('SELECT credits, last_refill_at FROM user_wallets WHERE user_id = ? FOR UPDATE', [userId], conn);
    },

    /** @param {string} userId @param {number} credits @param {boolean} refilled @param {import('../../config/db').Executor} conn */
    async setCredits(userId, credits, refilled, conn) {
      await db.run(
        'UPDATE user_wallets SET credits = ?, last_refill_at = IF(?, UTC_TIMESTAMP(3), last_refill_at) WHERE user_id = ?',
        [credits, refilled ? 1 : 0, userId],
        conn,
      );
    },

    /**
     * @param {string} userId @param {number} delta @param {string} reason @param {string | null} refId
     * @param {number} balanceAfter @param {import('../../config/db').Executor} conn
     */
    async addLedger(userId, delta, reason, refId, balanceAfter, conn) {
      await db.run(
        'INSERT INTO credit_ledger (id, user_id, delta, reason, ref_id, balance_after) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), userId, delta, reason, refId, balanceAfter],
        conn,
      );
    },

    /** @param {string} userId @param {string} reason @param {string} refId @param {import('../../config/db').Executor} conn */
    async hasLedger(userId, reason, refId, conn) {
      const r = await db.one('SELECT 1 AS ok FROM credit_ledger WHERE user_id = ? AND reason = ? AND ref_id = ? LIMIT 1', [userId, reason, refId], conn);
      return Boolean(r);
    },

    /**
     * Bu transaction'da eklenmiş (henüz granted yazılmamış) satın alımın mağaza işlem kimliği
     * @param {string} userId @param {string} productId @param {import('../../config/db').Executor} conn
     */
    async pendingPurchaseTx(userId, productId, conn) {
      const r = await db.one(
        'SELECT store_transaction_id AS tx FROM purchases WHERE user_id = ? AND product_id = ? AND granted IS NULL ORDER BY created_at DESC LIMIT 1',
        [userId, productId],
        conn,
      );
      return r ? String(r.tx) : null;
    },
  };
}

module.exports = { createCreditsRepository };
