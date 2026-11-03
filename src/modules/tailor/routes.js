'use strict';

const { defineModule } = require('../../core/route');
const { TailorAnalysis, AnalyzeBody, ApplyBody, TailorPreview, SaveBody, SaveResult } = require('./schemas');

// Yollar Flutter'daki mock rota tablosuyla birebir aynı. Uygulama apply / save'e kimlik göndermez:
// sunucu kullanıcının son oturumunu (tailor_sessions) kullanır.
module.exports = defineModule('tailor', '/tailor', [
  {
    method: 'post',
    path: '/analyze',
    summary: "CV'yi iş ilanına göre analiz eder, 3 öneri üretir (1 kredi)",
    auth: 'required',
    rateLimit: { windowMs: 3600_000, max: 20 },
    request: { body: AnalyzeBody },
    response: TailorAnalysis,
    async: { etaS: 25 },
    handler: ({ user, body, deps }) => deps.tailor.analyze(user, body),
  },
  {
    method: 'post',
    path: '/apply',
    summary: 'Seçilen önerileri uygular, önizleme döner (kredi yok)',
    auth: 'required',
    rateLimit: { windowMs: 60_000, max: 30 }, // OWASP API6
    request: { body: ApplyBody },
    response: TailorPreview,
    handler: ({ user, body, deps }) => deps.tailor.apply(user, body.section_ids),
  },
  {
    method: 'post',
    path: '/save',
    summary: "Uyarlanmış CV'yi yeni CV olarak kaydeder (idempotent)",
    auth: 'required',
    rateLimit: { windowMs: 60_000, max: 20 }, // OWASP API6
    request: { body: SaveBody },
    response: SaveResult,
    handler: ({ user, deps }) => deps.tailor.save(user),
  },
]);
