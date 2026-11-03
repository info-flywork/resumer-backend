'use strict';

/**
 * Hesap silme (App Store 5.1.1(v), Google Play ve KVKK gereği gerçekten silinir):
 * 1) DELETE /me → hesap hemen kapanır (deleted_at), kalıcı silme zamanı yazılır (varsayılan: hemen).
 * 2) Worker "account-purge" işi zamanı gelen hesapları kalıcı siler: önce dış servisler (Firebase
 *    kullanıcısı, RevenueCat abone kaydı, OneSignal kullanıcısı), sonra modüllerin kendi temizliği
 *    (ör. CDN'deki dosyalar), en son users satırı — FK'lar ON DELETE CASCADE ile kalan her şeyi siler.
 *
 * @typedef {(user: import('./repository').UserRow, deps: import('../../container').Container) => Promise<void>} PurgeHook
 */

/** @type {PurgeHook[]} */
const purgeHooks = [...require('../app.generated').purgeHooks];

/**
 * Modüller dosya / dış kayıt temizliği için kanca ekler (DB satırları cascade ile zaten silinir).
 * @param {PurgeHook} hook
 */
function onUserPurge(hook) {
  purgeHooks.push(hook);
}

/**
 * @param {import('../../container').Container} deps
 */
function createAccountService(deps) {
  const { users, logger, config } = deps;

  return {
    /** @param {import('./repository').UserRow} user */
    async requestDeletion(user) {
      const row = await users.markDeleted(user.id, config.ACCOUNT_DELETION_GRACE_DAYS);
      logger.info('account_deletion_requested', { userId: user.id, graceDays: config.ACCOUNT_DELETION_GRACE_DAYS });
      return { purge_after: new Date(row.purge_after).toISOString() };
    },

    /**
     * Zamanı gelen hesapları kalıcı siler. Dış serviste hata olursa o hesap bir sonraki çalıştırmada
     * tekrar denenir (satır silinmeden kalır).
     * @param {number} [limit]
     */
    async purgeDue(limit = 20) {
      const due = await users.duePurges(limit);
      let purged = 0;
      for (const user of due) {
        try {
          await deps.firebaseUsers.delete(user.firebase_uid);
          if (deps.revenueCat.enabled) await deps.revenueCat.deleteSubscriber(user.id);
          if (deps.oneSignal.enabled) await deps.oneSignal.deleteUser(user.id);
          for (const hook of purgeHooks) await hook(user, deps);
          await users.hardDelete(user.id);
          purged += 1;
          logger.info('account_purged', { userId: user.id });
        } catch (err) {
          logger.error('account_purge_failed', { userId: user.id, err });
        }
      }
      return { purged, failed: due.length - purged };
    },
  };
}

module.exports = { createAccountService, onUserPurge };
