'use strict';

/**
 * Ürünler. Uygulamanın ürünleri modül klasöründeki products.js'te (scripts/register.js birleştirir).
 *
 * ENTITLEMENTS: RevenueCat'teki entitlement kimlikleri (ör. "premium"). Route'larda
 *   `premium: true` (herhangi biri) ya da `premium: 'premium'` (belirli biri) ile kullanılır.
 *
 * CONSUMABLES: tek seferlik ürünler (ör. coin paketi). `grant` aynı transaction içinde çalışır;
 *   her mağaza işlemi için YALNIZCA BİR KEZ çağrılır. Döndürdüğü nesne purchases.granted'a yazılır.
 */

const generated = require('../app.generated').products;

/** @type {string[]} */
const ENTITLEMENTS = [...new Set(['premium', ...generated.entitlements])];

/**
 * @type {Record<string, {
 *   description: string,
 *   grant: (userId: string, conn: import('mysql2/promise').PoolConnection, deps: import('../../container').Container) => Promise<Record<string, unknown>>,
 * }>}
 */
const CONSUMABLES = {
  ...generated.consumables,
  // Uygulama ürünleri modülün products.js dosyasında. Örnek:
  // coins_100: {
  //   description: '100 coin',
  //   async grant(userId, conn) {
  //     await conn.query('UPDATE user_coins SET coins = coins + 100 WHERE user_id = ?', [userId]);
  //     return { coins: 100 };
  //   },
  // },
};

module.exports = { ENTITLEMENTS, CONSUMABLES };
