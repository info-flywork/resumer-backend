'use strict';

const { z } = require('zod');
const { defineModule } = require('../../core/route');
const { unauthorized } = require('../../core/errors');
const { UserPublic, toUserPublic, UpdateMeBody } = require('./schemas');

/**
 * Kimlik ve hesap (şablon). Uygulamanın kendi uçları (ör. GET /me profil, DELETE /me) Flutter'daki mock
 * sözleşmesine göre AYRI modülde yazılır; hesap silme için `deps.account.requestDeletion(user)` çağrılır.
 * Buradaki /account uçları her uygulamada aynıdır (sözleşmede yoksa da zararsız).
 */
module.exports = defineModule('auth', '', [
  {
    method: 'post',
    path: '/auth/sync',
    summary: 'Firebase girişinden sonra çağrılır: kullanıcıyı oluşturur / günceller (silme bekleme süresindeyse geri getirir)',
    auth: 'none',
    rateLimit: { windowMs: 60_000, max: 30 },
    response: z.object({ user: UserPublic, created: z.boolean() }),
    async handler({ req, deps }) {
      const decoded = await deps.auth.decode(req);
      if (!decoded) throw unauthorized();
      const { user, created } = await deps.users.syncFromToken(decoded);
      if (user.deleted_at) throw unauthorized('Bu hesap silindi', 'ACCOUNT_DELETED');
      return { user: toUserPublic(user), created };
    },
  },
  {
    method: 'get',
    path: '/account',
    summary: 'Giriş yapmış kullanıcı',
    auth: 'required',
    response: z.object({ user: UserPublic }),
    async handler({ user }) {
      return { user: toUserPublic(/** @type {any} */ (user)) };
    },
  },
  {
    method: 'patch',
    path: '/account',
    summary: 'Kullanıcı bilgilerini güncelle',
    auth: 'required',
    request: { body: UpdateMeBody },
    response: z.object({ user: UserPublic }),
    async handler({ user, body, deps }) {
      const updated = await deps.users.update(/** @type {any} */ (user).id, body);
      return { user: toUserPublic(updated) };
    },
  },
  {
    method: 'delete',
    path: '/account',
    summary: 'Hesabı sil (geri alınamaz; bekleme süresi ayarlıysa o süre içinde tekrar girişle iptal edilir)',
    auth: 'required',
    rateLimit: { windowMs: 60_000, max: 5 },
    response: z.object({ deletion: z.object({ purge_after: z.string() }) }),
    async handler({ user, deps }) {
      return { deletion: await deps.account.requestDeletion(/** @type {any} */ (user)) };
    },
  },
]);
