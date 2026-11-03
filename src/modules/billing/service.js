'use strict';

const { randomUUID } = require('node:crypto');
const { isDuplicate } = require('../../config/db');
const { CONSUMABLES } = require('./products');

/**
 * @param {import('../../container').Container} deps
 */
function createBillingService(deps) {
  const { db, logger } = deps;

  const entitlements = {
    /**
     * Kullanıcının aktif entitlement'ı var mı? (süresi dolmamış ya da ömür boyu)
     * @param {string} userId
     * @param {string | null} [entitlement] null = herhangi biri
     */
    async isActive(userId, entitlement = null) {
      const row = await db.one(
        `SELECT 1 AS ok FROM entitlements
         WHERE user_id = ? AND (? IS NULL OR entitlement = ?)
           AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP(3)) LIMIT 1`,
        [userId, entitlement, entitlement],
      );
      return Boolean(row);
    },
    /** @param {string} userId */
    list(userId) {
      return db.query(
        `SELECT entitlement, product_id, store, expires_at FROM entitlements
         WHERE user_id = ? AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP(3)) ORDER BY entitlement`,
        [userId],
      );
    },
  };

  /**
   * RevenueCat'teki abone durumunu sunucuya kopyalar (entitlement'lar + tüketilebilir ürünler).
   * @param {string} userId
   */
  async function syncFromRevenueCat(userId) {
    if (!deps.revenueCat.enabled) return { synced: false };
    const sub = await deps.revenueCat.getSubscriber(userId);
    await db.tx(async (conn) => {
      await conn.query('DELETE FROM entitlements WHERE user_id = ?', [userId]);
      for (const [id, e] of Object.entries(sub.entitlements || {})) {
        await conn.query(
          'INSERT INTO entitlements (user_id, entitlement, product_id, store, expires_at) VALUES (?, ?, ?, ?, ?)',
          [userId, id, e.product_identifier ?? null, e.store ?? null, e.expires_date ? new Date(e.expires_date) : null],
        );
      }
    });
    let granted = 0;
    for (const [productId, list] of Object.entries(sub.non_subscriptions || {})) {
      for (const p of list) {
        const r = await grantConsumable(userId, productId, p.store_transaction_id || p.id, p.store);
        if (r.granted) granted += 1;
      }
    }
    return { synced: true, granted };
  }

  /**
   * Tüketilebilir ürünü işlem başına bir kez verir.
   * @param {string} userId @param {string} productId @param {string} transactionId @param {string | null} store
   */
  async function grantConsumable(userId, productId, transactionId, store) {
    const product = CONSUMABLES[productId];
    if (!product || !transactionId) return { granted: false, reason: 'unknown_product' };
    try {
      return await db.tx(async (conn) => {
        const id = randomUUID();
        await conn.query(
          'INSERT INTO purchases (id, user_id, product_id, store_transaction_id, store) VALUES (?, ?, ?, ?, ?)',
          [id, userId, productId, transactionId, store],
        );
        const granted = await product.grant(userId, conn, deps);
        await conn.query('UPDATE purchases SET granted = ? WHERE id = ?', [JSON.stringify(granted ?? {}), id]);
        logger.info('consumable_granted', { userId, productId });
        return { granted: true };
      });
    } catch (err) {
      if (isDuplicate(err)) return { granted: false, reason: 'duplicate' };
      throw err;
    }
  }

  /**
   * Webhook: olay bir kez işlenir; ardından kullanıcının durumu RevenueCat'ten okunur (olay sırası /
   * eksik olay sorunlarından etkilenmez). Secret key yoksa olaydaki bilgiler kullanılır.
   * @param {any} event
   */
  async function handleWebhook(event) {
    const id = String(event?.id || '');
    const type = String(event?.type || '');
    if (!id || !type) return { result: 'ignored_invalid' };
    try {
      await db.run('INSERT INTO revenuecat_events (id, type, app_user_id) VALUES (?, ?, ?)', [id, type, event.app_user_id ?? null]);
    } catch (err) {
      if (isDuplicate(err)) return { result: 'duplicate' };
      throw err;
    }
    // TRANSFER: hem eski hem yeni kullanıcı güncellenir
    const ids = new Set([event.app_user_id, ...(event.transferred_from || []), ...(event.transferred_to || [])].filter(Boolean));
    let result = 'no_user';
    for (const appUserId of ids) {
      if (String(appUserId).startsWith('$RCAnonymousID')) continue;
      const user = await deps.users.findById(String(appUserId));
      if (!user) continue;
      if (deps.revenueCat.enabled) await syncFromRevenueCat(user.id);
      else await applyEvent(user.id, event);
      result = 'synced';
    }
    await db.run('UPDATE revenuecat_events SET result = ? WHERE id = ?', [result, id]);
    return { result };
  }

  /**
   * Secret key olmadan: olaydaki entitlement / süre bilgisini uygula.
   * @param {string} userId @param {any} event
   */
  async function applyEvent(userId, event) {
    const expires = event.expiration_at_ms ? new Date(Number(event.expiration_at_ms)) : null;
    if (event.type === 'NON_RENEWING_PURCHASE' && CONSUMABLES[event.product_id]) {
      await grantConsumable(userId, event.product_id, event.transaction_id, event.store ?? null);
      return;
    }
    for (const ent of event.entitlement_ids || []) {
      if (event.type === 'EXPIRATION') {
        await db.run('DELETE FROM entitlements WHERE user_id = ? AND entitlement = ?', [userId, ent]);
        continue;
      }
      await db.run(
        `INSERT INTO entitlements (user_id, entitlement, product_id, store, expires_at) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE product_id = VALUES(product_id), store = VALUES(store), expires_at = VALUES(expires_at)`,
        [userId, ent, event.product_id ?? null, event.store ?? null, expires],
      );
    }
  }

  return { entitlements, syncFromRevenueCat, grantConsumable, handleWebhook };
}

module.exports = { createBillingService };
