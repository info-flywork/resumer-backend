'use strict';

const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
// eslint-disable-next-line no-unused-vars -- yalnızca JSDoc tiplerinde (z.ZodType)
const { z } = require('zod');
const { AppError, unprocessable, forbidden } = require('./errors');

/**
 * Bildirimsel rota tanımı — her uç bir nesne. Express rotası, girdi doğrulama, kimlik, premium kilidi,
 * hız sınırı, yanıt şeması kontrolü, OpenAPI belgesi ve sözleşme testleri bu TEK tanımdan üretilir.
 *
 * @typedef {'none' | 'optional' | 'required'} AuthMode
 *
 * @typedef {{
 *   body?: z.ZodType,
 *   query?: z.ZodType,
 *   params?: z.ZodType,
 * }} RequestSchemas
 *
 * @typedef {{
 *   body: any, query: any, params: any,
 *   user: import('../modules/auth/repository').UserRow | null,
 *   req: import('express').Request,
 *   res: import('express').Response,
 *   deps: import('../container').Container,
 *   log: import('./logger').Logger,
 * }} Ctx
 *
 * @typedef {{
 *   method: 'get' | 'post' | 'put' | 'patch' | 'delete',
 *   path: string,
 *   summary: string,
 *   auth: AuthMode,
 *   request?: RequestSchemas,
 *   response?: z.ZodType,
 *   status?: number,
 *   premium?: boolean | string,
 *   rateLimit?: { windowMs: number, max: number },
 *   raw?: boolean,
 *   async?: { etaS: number },
 *   tags?: string[],
 *   handler: (ctx: Ctx) => Promise<unknown>,
 * }} RouteDef
 *
 * @typedef {{ name: string, prefix: string, routes: RouteDef[] }} Module
 */

/**
 * @param {string} name modül adı (OpenAPI etiketi)
 * @param {string} prefix ör. "/cvs" (boş olabilir)
 * @param {RouteDef[]} routes
 * @returns {Module}
 */
function defineModule(name, prefix, routes) {
  return { name, prefix, routes };
}

/**
 * Değeri şemanın şekline indirger: nesnede yalnızca şemadaki anahtarlar kalır (iç içe, listelerde de). Şema
 * doğrulaması başarısız olsa bile (canlı) tanımsız alan istemciye gitmez.
 * @param {any} schema @param {any} value @returns {any}
 */
function stripTo(schema, value) {
  if (value === null || value === undefined || !schema) return value;
  const def = schema._zod?.def ?? schema.def ?? {};
  switch (def.type) {
    case 'optional': case 'nullable': case 'default': case 'catch': case 'readonly': case 'nonoptional':
      return stripTo(def.innerType, value);
    case 'pipe':
      return stripTo(def.out ?? def.in, value);
    case 'array':
      return Array.isArray(value) ? value.map((v) => stripTo(def.element, v)) : value;
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return value;
      /** @type {Record<string, any>} */
      const out = {};
      for (const [k, sub] of Object.entries(def.shape ?? {})) if (k in value) out[k] = stripTo(sub, value[k]);
      return out;
    }
    case 'union':
      return value; // hangi dalın kastedildiği belirsiz — union cevaplarda alanları sen sınırla
    default:
      return typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && def.type !== 'record'
        && def.type !== 'any' && def.type !== 'unknown' ? {} : value;
  }
}

/** Express yolu (/:id) → OpenAPI yolu ({id}) */
const toOpenApiPath = (p) => p.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');

/**
 * @param {z.ZodError} err
 */
function issuesOf(err) {
  return err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}

/**
 * Modülü Express router'a çevirir.
 * @param {Module} mod
 * @param {import('../container').Container} deps
 */
function buildRouter(mod, deps) {
  const router = express.Router();
  const strictResponses = deps.config.NODE_ENV !== 'production';
  for (const def of mod.routes) {
    const route = `${def.method.toUpperCase()} ${mod.prefix}${def.path}`;
    const kind = route.slice(0, 64);

    /** Yanıt şeması denetimi @param {unknown} data @param {import('./logger').Logger} log */
    const checked = (data, log) => {
      const out = data ?? null;
      if (!def.response) return out;
      const r = def.response.safeParse(out);
      if (r.success) return r.data;
      // Sözleşme ihlali: geliştirme / testte hata, canlıda yalnızca log (kullanıcı etkilenmesin)
      log.error('response_contract_violation', { issues: issuesOf(r.error) });
      if (strictResponses) throw new AppError(500, 'RESPONSE_CONTRACT', 'Yanıt sözleşmeye uymuyor', issuesOf(r.error));
      // Canlıda ham veri GİTMEZ: şemada tanımlı olmayan alanlar ayıklanır (OWASP API3)
      return stripTo(def.response, out);
    };

    /** @type {import('express').RequestHandler[]} */
    const chain = [];
    if (def.rateLimit && !deps.config.DEV_UNLIMITED) {
      chain.push(
        rateLimit({
          windowMs: def.rateLimit.windowMs,
          limit: def.rateLimit.max,
          standardHeaders: 'draft-8',
          legacyHeaders: false,
          // Giriş yapmış kullanıcıya göre; değilse IP
          keyGenerator: (req) => /** @type {any} */ (req).user?.id || ipKeyGenerator(req.ip || '0.0.0.0'),
          handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Çok fazla istek, biraz sonra tekrar dene')),
        }),
      );
    }
    if (def.auth !== 'none') chain.unshift(def.auth === 'required' ? deps.auth.required : deps.auth.optional);
    if (def.premium) {
      const entitlement = typeof def.premium === 'string' ? def.premium : null;
      chain.push(async (req, _res, next) => {
        if (deps.config.DEV_UNLIMITED) return next();
        const user = /** @type {any} */ (req).user;
        const ok = user && (await deps.entitlements.isActive(user.id, entitlement));
        next(ok ? undefined : forbidden('Bu özellik premium üyelere açık', 'PREMIUM_REQUIRED'));
      });
    }
    chain.push(async (req, res) => {
      /** @type {{ body?: any, query?: any, params?: any }} */
      const parsed = {};
      const problems = [];
      for (const part of /** @type {const} */ (['params', 'query', 'body'])) {
        const schema = def.request?.[part];
        if (!schema) {
          parsed[part] = req[part];
          continue;
        }
        const r = schema.safeParse(req[part] ?? {});
        if (r.success) parsed[part] = r.data;
        else problems.push(...issuesOf(r.error));
      }
      // Tüm alan hataları tek yanıtta (form tek seferde işaretlenebilsin)
      if (problems.length) throw unprocessable('Gönderilen bilgilerde hata var', problems);
      const user = /** @type {any} */ (req).user ?? null;
      const log = deps.logger.child({ reqId: /** @type {any} */ (req).id, route });
      // Uzun iş: istemci isterse kuyruğa al, 202 { task_id } (GET /jobs/:id); başlıksız istek eskisi gibi bekler
      if (def.async && user && /\brespond-async\b/i.test(req.get('prefer') || '')) {
        const job = await deps.tasks.enqueue(user, kind, { user_id: user.id, ...parsed }, { etaS: def.async.etaS });
        res.status(202).json({ status: 'success', message: 'ok', data: job });
        return;
      }
      const data = await def.handler({ body: parsed.body, query: parsed.query, params: parsed.params, user, req, res, deps, log });
      if (def.raw) return; // yanıtı işleyici kendi yazdı (ör. dosya, yönlendirme)
      res.status(def.status ?? 200).json({ status: 'success', message: 'ok', data: checked(data, log) });
    });
    if (def.async) {
      // Arka planda aynı işleyici; kullanıcı kayıttan yeniden okunur (silindiyse iş başarısız)
      deps.tasks.define(kind, async (/** @type {any} */ input) => {
        const user = await deps.users.findById(input.user_id);
        if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Oturum gerekli');
        const log = deps.logger.child({ route, task: true });
        const data = await def.handler({
          body: input.body, query: input.query, params: input.params, user,
          req: /** @type {any} */ (null), res: /** @type {any} */ (null), deps, log,
        });
        return checked(data, log);
      });
    }
    router[def.method](def.path, ...chain);
  }
  return router;
}

module.exports = { defineModule, buildRouter, toOpenApiPath, issuesOf, stripTo };
