'use strict';

const { defineModule } = require('../../core/route');
const { CvDraftBody, ScoreResult, SubmitResult, SubmitQuery } = require('./schemas');

// Yollar Flutter'daki mock rota tablosuyla birebir; iki önek (/cvs, /cv-builder) olduğundan prefix boş.
module.exports = defineModule('cv_builder', '', [
  {
    method: 'post',
    path: '/cvs/score',
    summary: 'Taslak tamlık puanı (0..100, yapay zekâsız, kayıt yazmaz)',
    auth: 'required',
    rateLimit: { windowMs: 60_000, max: 60 },
    request: { body: CvDraftBody },
    response: ScoreResult,
    handler: ({ body, deps }) => deps.cvBuilder.score(body),
  },
  {
    method: 'post',
    path: '/cv-builder/submit',
    summary: "Taslağı CV olarak kaydet (cv_id verilirse o CV'yi güncelle)",
    auth: 'required',
    rateLimit: { windowMs: 60_000, max: 20 },
    request: { query: SubmitQuery, body: CvDraftBody },
    response: SubmitResult,
    handler: ({ user, query, body, deps }) => deps.cvBuilder.submit(user, body, query.cv_id),
  },
]);
