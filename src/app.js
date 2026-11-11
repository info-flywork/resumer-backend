'use strict';

const { randomUUID } = require('node:crypto');
const compression = require('compression');
const express = require('express');
const helmet = /** @type {any} */ (require('helmet'));
const { rateLimit } = require('express-rate-limit');
const { buildRouter } = require('./core/route');
const { buildOpenApi } = require('./core/openapi');
const { AppError } = require('./core/errors');

/**
 * Express uygulaması (dinlemeye başlamaz — testler de bunu kullanır).
 * @param {import('./container').Container} deps
 * @param {import('./core/route').Module[]} modules
 */
function createApp(deps, modules) {
  const { config, logger } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  // JSON cevaplar gzip / br ile ~%70–80 küçülür (1 KB altı sıkıştırılmaz)
  app.use(compression({ threshold: 1024 }));
  // CV PDF/DOCX (base64) için büyük gövde
  app.use('/analyses', express.json({ limit: '15mb' }));
  app.use('/cvs/import', express.json({ limit: '15mb' }));
  app.use(express.json({ limit: '1mb' }));
  // GET cevapları: Express zayıf ETag üretir → istemci If-None-Match gönderirse 304 (gövde yok).
  // Kullanıcıya özel veri ara sunucularda saklanmaz, her seferinde ETag ile doğrulanır.
  app.use((req, res, next) => {
    if (req.method === 'GET') res.setHeader('Cache-Control', 'private, no-cache');
    next();
  });

  // İstek kimliği + kısa erişim logu (kişisel veri yok)
  app.use((req, res, next) => {
    const id = String(req.headers['x-request-id'] || randomUUID());
    /** @type {any} */ (req).id = id;
    res.setHeader('x-request-id', id);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      if (config.NODE_ENV === 'test') return;
      logger.info('http', {
        reqId: id,
        method: req.method,
        path: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path,
        status: res.statusCode,
        ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
        userId: /** @type {any} */ (req).user?.id,
      });
    });
    next();
  });

  // Genel IP sınırı (uç bazında ayrıca sınır route tanımında)
  if (!config.DEV_UNLIMITED) {
    app.use(
      rateLimit({
        windowMs: 60_000,
        limit: config.RATE_LIMIT_PER_MINUTE,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        skip: (req) => req.path === '/health',
        handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Çok fazla istek, biraz sonra tekrar dene')),
      }),
    );
  }

  for (const mod of modules) app.use(mod.prefix || '/', buildRouter(mod, deps));

  if (config.OPENAPI_ENABLED) {
    const spec = buildOpenApi(modules, { title: 'API', version: '1', serverUrl: config.PUBLIC_BASE_URL });
    app.get('/openapi.json', (_req, res) => res.json(spec));
  }

  app.use((req, _res, next) => next(new AppError(404, 'NOT_FOUND', `${req.method} ${req.path} bulunamadı`)));

  // Hata zarfı — Flutter BaseResponse: { status: "error", message, code, data: null, errors? }
  app.use((err, req, res, _next) => {
    const known = err instanceof AppError;
    const bodyError = err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large';
    const status = known ? err.status : bodyError ? (err.type === 'entity.too.large' ? 413 : 400) : 500;
    if (status >= 500) logger.error('request_failed', { reqId: req.id, path: req.path, err });
    res.status(status).json({
      status: 'error',
      message: known ? err.message : bodyError ? 'İstek gövdesi okunamadı' : 'Beklenmeyen bir hata oluştu',
      code: known ? err.code : bodyError ? 'BAD_BODY' : 'INTERNAL_ERROR',
      data: null,
      ...(known && Array.isArray(err.details) ? { errors: err.details } : {}),
    });
  });

  return app;
}

module.exports = { createApp };
