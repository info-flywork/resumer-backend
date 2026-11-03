'use strict';

const { createHash } = require('node:crypto');
const { AppError } = require('./errors');

/**
 * Firebase ID token'ından gelen bilgiler (yalnızca kullandıklarımız).
 * @typedef {{
 *   uid: string,
 *   email?: string,
 *   email_verified?: boolean,
 *   phone_number?: string,
 *   name?: string,
 *   picture?: string,
 *   exp: number,
 *   firebase?: { sign_in_provider?: string },
 * }} DecodedToken
 *
 * @typedef {{
 *   verify: (token: string, opts?: { checkRevoked?: boolean }) => Promise<DecodedToken>,
 * }} TokenVerifier
 */

/** Firebase Admin hata kodları: bunlar "token geçersiz" (401); diğer her şey altyapı sorunu (503). */
const INVALID_TOKEN_CODES = new Set([
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/argument-error',
  'auth/invalid-id-token',
  'auth/user-disabled',
  'auth/user-not-found',
]);

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isInvalidTokenError(err) {
  const code = /** @type {any} */ (err)?.code || /** @type {any} */ (err)?.errorInfo?.code;
  return typeof code === 'string' && (INVALID_TOKEN_CODES.has(code) || code.startsWith('auth/invalid'));
}

/**
 * Doğrulanmış token'ları süreleri dolana kadar (en çok 5 dk) bellekte tutar: her istekte Firebase'e
 * gidilmez. Tek süreç (PM2 fork) için yeterli; birden fazla kopyada her kopya kendi önbelleğini tutar.
 * @param {TokenVerifier} verifier
 * @param {{ maxEntries?: number, maxAgeMs?: number, now?: () => number }} [opts]
 * @returns {TokenVerifier}
 */
function cachedVerifier(verifier, { maxEntries = 5000, maxAgeMs = 5 * 60_000, now = Date.now } = {}) {
  /** @type {Map<string, { decoded: DecodedToken, until: number }>} */
  const cache = new Map();
  return {
    async verify(token, opts = {}) {
      const key = createHash('sha256').update(token).digest('base64url');
      if (!opts.checkRevoked) {
        const hit = cache.get(key);
        if (hit && hit.until > now()) return hit.decoded;
        if (hit) cache.delete(key);
      }
      const decoded = await verifier.verify(token, opts);
      const until = Math.min(decoded.exp * 1000, now() + maxAgeMs);
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
      cache.set(key, { decoded, until });
      return decoded;
    },
  };
}

/**
 * Kimlik ara katmanları.
 * - required: geçerli token şart; kullanıcı MySQL'de yoksa token'dan oluşturulur (ilk istek /auth/sync
 *   olmasa da çalışır).
 * - optional: token varsa kullanıcıyı ekler, yoksa devam eder.
 * Token geçersiz → 401 (uygulama oturumu kapatır). Firebase / veritabanı erişilemiyor → 503 (uygulama
 * oturumu KAPATMAZ, tekrar dener).
 *
 * @param {{
 *   verifier: TokenVerifier,
 *   users: import('../modules/auth/repository').UserRepository,
 *   logger: import('./logger').Logger,
 * }} deps
 */
function createAuth({ verifier, users, logger }) {
  /**
   * Authorization başlığındaki token'ı doğrular (kullanıcıya dokunmaz).
   * @param {import('express').Request} req
   * @param {{ checkRevoked?: boolean }} [opts]
   * @returns {Promise<DecodedToken | null>}
   */
  async function decode(req, opts = {}) {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return null;
    try {
      return await verifier.verify(match[1].trim(), opts);
    } catch (err) {
      if (isInvalidTokenError(err)) throw new AppError(401, 'INVALID_TOKEN', 'Oturumun süresi doldu, tekrar giriş yap');
      logger.error('auth_verifier_unavailable', { err });
      throw new AppError(503, 'AUTH_UNAVAILABLE', 'Giriş servisine ulaşılamıyor, birazdan tekrar dene');
    }
  }

  /**
   * @param {import('express').Request} req
   * @param {boolean} mustHave
   */
  async function resolve(req, mustHave) {
    const decoded = await decode(req);
    if (!decoded) {
      if (mustHave) throw new AppError(401, 'UNAUTHORIZED', 'Oturum gerekli');
      return;
    }
    let user;
    let created = false;
    try {
      user = await users.findByFirebaseUid(decoded.uid);
      if (!user) ({ user, created } = await users.syncFromToken(decoded));
    } catch (err) {
      logger.error('auth_user_lookup_failed', { err });
      throw new AppError(503, 'UNAVAILABLE', 'Servis geçici olarak kullanılamıyor');
    }
    // Silinen hesap: yalnızca yeniden giriş (POST /auth/sync) bekleme süresi içindeyse geri getirir
    if (user.deleted_at) throw new AppError(401, 'ACCOUNT_DELETED', 'Bu hesap silindi');
    /** @type {any} */ (req).user = user;
    /** @type {any} */ (req).userCreated = created;
    /** @type {any} */ (req).firebase = decoded;
  }

  return {
    decode,
    /** @param {import('express').Request} req @param {unknown} _res @param {(err?: unknown) => void} next */
    required: async (req, _res, next) => {
      await resolve(req, true);
      next();
    },
    /** @param {import('express').Request} req @param {unknown} _res @param {(err?: unknown) => void} next */
    optional: async (req, _res, next) => {
      await resolve(req, false);
      next();
    },
  };
}

/**
 * Gerçek Firebase doğrulayıcı.
 * @param {import('firebase-admin/app').App | null} app
 * @returns {TokenVerifier}
 */
function firebaseVerifier(app) {
  return {
    async verify(token, opts = {}) {
      if (!app) throw new Error('Firebase yapılandırılmamış (FIREBASE_SERVICE_ACCOUNT)');
      const { getAuth } = require('firebase-admin/auth');
      const decoded = await getAuth(app).verifyIdToken(token, Boolean(opts.checkRevoked));
      return /** @type {DecodedToken} */ (/** @type {unknown} */ (decoded));
    },
  };
}

module.exports = { createAuth, cachedVerifier, firebaseVerifier, isInvalidTokenError };
