'use strict';

const { z } = require('zod');
const { defineModule } = require('../../core/route');
const { AnalysisResult, FixResult, AnalyzeBody, FixBody } = require('./schemas');

const LatestQuery = z.object({ cv_id: z.string().min(1).max(64) });

// Yollar Flutter'daki mock rota tablosuyla birebir aynı (POST /analyses, POST /analyses/fix).
module.exports = defineModule('analyses', '/analyses', [
  {
    method: 'get',
    path: '/latest',
    summary: 'CV’nin kayıtlı son analiz sonucu',
    auth: 'required',
    request: { query: LatestQuery },
    response: AnalysisResult,
    handler: ({ user, query, deps }) => deps.analyses.latest(user, query.cv_id),
  },
  {
    method: 'post',
    path: '',
    summary: 'CV ya da LinkedIn analizi (1 kredi)',
    auth: 'required',
    rateLimit: { windowMs: 3_600_000, max: 20 },
    request: { body: AnalyzeBody },
    response: AnalysisResult,
    async: { etaS: 25 },
    handler: ({ user, body, deps }) => deps.analyses.analyze(user, body),
  },
  {
    method: 'post',
    path: '/fix',
    summary: 'Analiz önerisini CV’ye uygula',
    auth: 'required',
    rateLimit: { windowMs: 3_600_000, max: 30 },
    request: { body: FixBody },
    response: FixResult,
    async: { etaS: 15 },
    handler: ({ user, body, deps }) => deps.analyses.fix(user, body.recommendation_id),
  },
]);
