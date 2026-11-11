'use strict';

const { defineModule } = require('../../core/route');
const {
  PortraitBody,
  SummaryBody,
  DescriptionBody,
  PortraitParams,
  PortraitResult,
  SummaryResult,
  DescriptionResult,
  ExperienceBody,
  ExperienceResult,
} = require('./schemas');

const HOUR = 3600_000;

module.exports = defineModule('ai', '/ai', [
  {
    method: 'post',
    path: '/portrait',
    summary: 'AI portre üretir (1 kredi)',
    auth: 'required',
    request: { body: PortraitBody },
    response: PortraitResult,
    rateLimit: { windowMs: HOUR, max: 10 },
    async: { etaS: 30 },
    handler: ({ user, body, deps }) => deps.ai.portrait(/** @type {any} */ (user), body),
  },
  {
    method: 'post',
    path: '/summary',
    summary: 'AI profesyonel özet yazar',
    auth: 'required',
    request: { body: SummaryBody },
    response: SummaryResult,
    rateLimit: { windowMs: HOUR, max: 30 },
    async: { etaS: 10 },
    handler: ({ user, body, deps }) => deps.ai.summary(/** @type {any} */ (user), body),
  },
  {
    method: 'post',
    path: '/description',
    summary: 'AI profil açıklamasını iyileştirir',
    auth: 'required',
    request: { body: DescriptionBody },
    response: DescriptionResult,
    rateLimit: { windowMs: HOUR, max: 30 },
    async: { etaS: 10 },
    handler: ({ user, body, deps }) => deps.ai.description(/** @type {any} */ (user), body),
  },
  {
    method: 'post',
    path: '/experience',
    summary: 'AI CV deneyim açıklamasını iyileştirir',
    auth: 'required',
    request: { body: ExperienceBody },
    response: ExperienceResult,
    rateLimit: { windowMs: HOUR, max: 30 },
    async: { etaS: 10 },
    handler: ({ user, body, deps }) => deps.ai.experience(/** @type {any} */ (user), body),
  },
  {
    method: 'get',
    path: '/portraits/:id.png',
    summary: 'Portre görselini sunar (herkese açık, id tahmin edilemez)',
    auth: 'none',
    request: { params: PortraitParams },
    raw: true,
    handler: async ({ params, res, deps }) => {
      const p = await deps.ai.getPortrait(params.id);
      // CV'lere kaydedilmiş eski adresler: CDN'e kalıcı yönlendirme (görsel değişmez)
      if ('redirect' in p) return res.set('Cache-Control', 'public, max-age=31536000, immutable').redirect(301, p.redirect);
      res.set({ 'Content-Type': p.mime, 'Cache-Control': 'public, max-age=31536000, immutable' }).send(p.image);
    },
  },
]);
