'use strict';

const { z } = require('zod');
const { defineModule } = require('../../core/route');
const { Profile, CvStats, UpdateBody } = require('./schemas');

// Yollar Flutter'daki mock rota tablosuyla birebir aynı (GET/PATCH/DELETE /me, GET /cvs/stats).
module.exports = defineModule('profile', '', [
  {
    method: 'get',
    path: '/me',
    summary: 'Profil (kredi, premium ve sayaçlarla)',
    auth: 'required',
    response: Profile,
    handler: ({ user, deps }) => deps.profile.get(/** @type {any} */ (user)),
  },
  {
    method: 'patch',
    path: '/me',
    summary: 'Profili güncelle (gövdede olan alanlar; boş / null temizler)',
    auth: 'required',
    rateLimit: { windowMs: 60_000, max: 30 },
    request: { body: UpdateBody },
    response: Profile,
    handler: ({ user, body, deps }) => deps.profile.update(/** @type {any} */ (user), body),
  },
  {
    method: 'delete',
    path: '/me',
    summary: 'Hesabı sil (bekleme süresi sonunda kalıcı; tekrar çağrı da 200)',
    auth: 'required',
    rateLimit: { windowMs: 60_000, max: 5 },
    response: null, // gövde yok (sözleşme: data null) — sızacak alan yok; security kapısı için açık işaret
    handler: ({ user, deps }) => deps.profile.remove(/** @type {any} */ (user)),
  },
  {
    method: 'get',
    path: '/cvs/stats',
    summary: 'CV sayaçları (toplam, uyarlanan, analiz)',
    auth: 'required',
    response: CvStats,
    handler: ({ user, deps }) => deps.profile.cvStats(/** @type {any} */ (user)),
  },
]);
