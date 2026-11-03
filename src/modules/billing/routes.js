'use strict';

const { timingSafeEqual } = require('node:crypto');
const { z } = require('zod');
const { defineModule } = require('../../core/route');
const { unauthorized, unavailable } = require('../../core/errors');

const Entitlements = z.object({
  is_premium: z.boolean(),
  entitlements: z.array(
    z.object({
      id: z.string(),
      product_id: z.string().nullable(),
      store: z.string().nullable(),
      expires_at: z.string().nullable(),
    }),
  ),
});

/** @param {any[]} rows */
const toEntitlements = (rows) => ({
  is_premium: rows.length > 0,
  entitlements: rows.map((r) => ({
    id: r.entitlement,
    product_id: r.product_id,
    store: r.store,
    expires_at: r.expires_at ? new Date(r.expires_at).toISOString() : null,
  })),
});

/** Sabit zamanlı karşılaştırma (sır tahmini zamanlamayla yapılamasın) */
function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

module.exports = defineModule('billing', '', [
  {
    method: 'get',
    path: '/me/entitlements',
    summary: 'Aktif abonelikler (premium durumu sunucudan)',
    auth: 'required',
    response: Entitlements,
    async handler({ user, deps }) {
      return toEntitlements(await deps.entitlements.list(/** @type {any} */ (user).id));
    },
  },
  {
    method: 'post',
    path: '/billing/sync',
    summary: 'Satın almadan hemen sonra çağrılır: durum RevenueCat\'ten doğrulanıp yazılır (istemcinin söylediğine güvenilmez)',
    auth: 'required',
    rateLimit: { windowMs: 60_000, max: 20 },
    response: Entitlements,
    async handler({ user, deps }) {
      const id = /** @type {any} */ (user).id;
      try {
        await deps.billing.syncFromRevenueCat(id);
      } catch (err) {
        deps.logger.error('billing_sync_failed', { userId: id, err });
        throw unavailable('Satın alma doğrulanamadı, birazdan tekrar dene', 'BILLING_UNAVAILABLE');
      }
      return toEntitlements(await deps.entitlements.list(id));
    },
  },
  {
    method: 'post',
    path: '/billing/revenuecat/webhook',
    summary: 'RevenueCat webhook (Authorization: REVENUECAT_WEBHOOK_AUTH)',
    auth: 'none',
    response: z.object({ result: z.string() }),
    tags: ['webhook'],
    async handler({ req, deps }) {
      const expected = deps.config.REVENUECAT_WEBHOOK_AUTH;
      const header = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!expected || !sameSecret(header, expected)) throw unauthorized('Geçersiz webhook', 'INVALID_WEBHOOK');
      // Hata fırlatırsa 5xx döner → RevenueCat tekrar dener; aynı olay ikinci kez işlenmez
      return deps.billing.handleWebhook(req.body?.event ?? req.body);
    },
  },
]);
