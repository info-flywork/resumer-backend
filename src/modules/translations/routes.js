'use strict';

const { defineModule } = require('../../core/route');
const { TranslateBody, TranslationResult } = require('./schemas');

module.exports = defineModule('translations', '/translations', [
  {
    method: 'post',
    path: '',
    summary: "CV'yi hedef dile çevirip draft CV oluşturur (Pro ya da ücretsiz deneme)",
    auth: 'required',
    rateLimit: { windowMs: 3600_000, max: 20 },
    request: { body: TranslateBody },
    response: TranslationResult,
    async: { etaS: 30 },
    handler: ({ user, body, deps }) => deps.translations.translate(/** @type {any} */ (user), body),
  },
]);
