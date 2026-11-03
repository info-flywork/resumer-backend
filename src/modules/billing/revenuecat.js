'use strict';

/**
 * RevenueCat REST (v1) — yalnızca sunucuda, secret key (sk_…) ile.
 * Abonelik durumu her zaman RevenueCat'ten okunur; istemcinin söylediğine güvenilmez.
 *
 * @typedef {{
 *   entitlements: Record<string, { expires_date: string | null, product_identifier: string, store?: string }>,
 *   non_subscriptions: Record<string, { id: string, store_transaction_id?: string, store: string, purchase_date: string }[]>,
 * }} Subscriber
 */

/**
 * @param {{ secretKey: string, fetch?: typeof fetch, baseUrl?: string }} opts
 */
function createRevenueCat({ secretKey, fetch: f = fetch, baseUrl = 'https://api.revenuecat.com/v1' }) {
  /**
   * @param {string} method
   * @param {string} path
   */
  async function call(method, path) {
    const r = await f(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (method === 'DELETE' && r.status === 404) return null;
    if (!r.ok) {
      const err = new Error(`RevenueCat ${method} ${path.split('/')[1]} → ${r.status}`);
      /** @type {any} */ (err).status = r.status;
      throw err;
    }
    return r.json();
  }

  return {
    enabled: Boolean(secretKey),
    /** @param {string} appUserId @returns {Promise<Subscriber>} */
    async getSubscriber(appUserId) {
      const body = await call('GET', `/subscribers/${encodeURIComponent(appUserId)}`);
      return body.subscriber;
    },
    /** Hesap silmede abone kaydını sil. @param {string} appUserId */
    async deleteSubscriber(appUserId) {
      await call('DELETE', `/subscribers/${encodeURIComponent(appUserId)}`);
    },
  };
}

module.exports = { createRevenueCat };
