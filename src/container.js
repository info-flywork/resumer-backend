'use strict';

const { createDb } = require('./config/db');
const { createFirebaseApp } = require('./config/firebase');
const { createLogger } = require('./core/logger');
const { createStorage } = require('./core/storage');
const { createAuth, cachedVerifier, firebaseVerifier } = require('./core/auth');
const { UserRepository } = require('./modules/auth/repository');
const { createAccountService } = require('./modules/auth/account');
const { createRevenueCat } = require('./modules/billing/revenuecat');
const { createBillingService } = require('./modules/billing/service');
const { createOneSignal } = require('./modules/notifications/onesignal');
const { createNotificationService } = require('./modules/notifications/service');

/**
 * Tüm bağımlılıklar tek yerde kurulur; route'lar ve işler bunları `deps` olarak alır.
 * Testler dış servisleri (Firebase, RevenueCat, OneSignal) `overrides` ile sahteleriyle değiştirir.
 * Şablon servisleri burada; uygulama modüllerinin servisleri register.js ile otomatik eklenir.
 *
 * @typedef {{
 *   config: import('./config/env').Config,
 *   logger: import('./core/logger').Logger,
 *   db: import('./config/db').Db,
 *   verifier: import('./core/auth').TokenVerifier,
 *   firebaseUsers: { delete: (uid: string) => Promise<void> },
 *   auth: ReturnType<typeof createAuth>,
 *   storage: import('./core/storage').Storage,
 *   users: UserRepository,
 *   account: ReturnType<typeof createAccountService>,
 *   revenueCat: ReturnType<typeof createRevenueCat>,
 *   billing: ReturnType<typeof createBillingService>,
 *   entitlements: ReturnType<typeof createBillingService>['entitlements'],
 *   oneSignal: ReturnType<typeof createOneSignal>,
 *   notifications: ReturnType<typeof createNotificationService>,
 *   [key: string]: any,
 * }} Container
 */

/**
 * @param {import('./config/env').Config} config
 * @param {Partial<Container>} [overrides]
 * @returns {Container}
 */
function createContainer(config, overrides = {}) {
  /** @type {Container} */
  const c = /** @type {any} */ ({ config });
  c.logger = overrides.logger ?? createLogger({ level: config.LOG_LEVEL });
  c.db = overrides.db ?? createDb(config);

  const firebaseApp = overrides.verifier && overrides.firebaseUsers ? null : createFirebaseApp(config);
  c.verifier = overrides.verifier ?? cachedVerifier(firebaseVerifier(firebaseApp));
  c.firebaseUsers = overrides.firebaseUsers ?? {
    async delete(uid) {
      if (!firebaseApp) throw new Error('Firebase yapılandırılmamış');
      const { getAuth } = require('firebase-admin/auth');
      try {
        await getAuth(firebaseApp).deleteUser(uid);
      } catch (err) {
        if (/** @type {any} */ (err)?.code !== 'auth/user-not-found') throw err;
      }
    },
  };

  c.storage = overrides.storage ?? createStorage(config);
  c.users = overrides.users ?? new UserRepository(c.db);
  c.auth = createAuth({ verifier: c.verifier, users: c.users, logger: c.logger });
  c.revenueCat = overrides.revenueCat ?? createRevenueCat({ secretKey: config.REVENUECAT_SECRET_KEY });
  c.oneSignal = overrides.oneSignal ?? createOneSignal({ appId: config.ONESIGNAL_APP_ID, restApiKey: config.ONESIGNAL_REST_API_KEY });
  c.billing = createBillingService(c);
  c.entitlements = c.billing.entitlements;
  c.notifications = createNotificationService(c);
  c.account = createAccountService(c);

  // uygulama servisleri: modül klasöründeki service.js → c.<modülAdı> (scripts/register.js)
  require('./modules/app.generated').registerServices(c);

  for (const [k, v] of Object.entries(overrides)) if (!(k in c) || c[k] === undefined) c[k] = v;
  return c;
}

module.exports = { createContainer };
