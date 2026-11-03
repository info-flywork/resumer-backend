'use strict';

/**
 * Test ortamı: gerçek MySQL (TEST_DB_*), sahte Firebase / RevenueCat / OneSignal.
 * Her test dosyası setup() ile temiz veritabanı alır (tablolar silinir, migration'lar baştan uygulanır).
 *
 * Token biçimi (sahte doğrulayıcı): "test:<uid>" ya da "test:<uid>:<email>"
 *   "expired" → 401 (token geçersiz), "down" → 503 (Firebase'e ulaşılamıyor)
 */
const path = require('node:path');
const mysql = require('mysql2/promise');

process.env.ENV_FILE = process.env.ENV_FILE || path.resolve(__dirname, '../.env.test');
const { loadConfig } = require('../src/config/env');
const { createContainer } = require('../src/container');
const { createApp } = require('../src/app');
const { modules: allModules } = require('../src/modules');
const { migrate } = require('../src/db/migrate');
const { createLogger } = require('../src/core/logger');

const db = {
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT || 3306),
  user: process.env.TEST_DB_USER || 'root',
  password: process.env.TEST_DB_PASSWORD || '',
  database: process.env.TEST_DB_NAME || 'app_test',
};

async function resetDatabase() {
  const conn = await mysql.createConnection({ ...db, multipleStatements: true });
  try {
    const [rows] = await conn.query(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
      [db.database],
    );
    const tables = /** @type {any[]} */ (rows).map((r) => r.t ?? r.TABLE_NAME);
    if (tables.length) {
      await conn.query(`SET FOREIGN_KEY_CHECKS = 0; DROP TABLE ${tables.map((t) => mysql.escapeId(t)).join(', ')}; SET FOREIGN_KEY_CHECKS = 1;`);
    }
  } finally {
    await conn.end();
  }
  await migrate(db, { log: () => {} });
}

/** Sahte Firebase doğrulayıcı */
const fakeVerifier = {
  /** @param {string} token */
  async verify(token) {
    if (token === 'expired') throw Object.assign(new Error('expired'), { code: 'auth/id-token-expired' });
    if (token === 'down') throw Object.assign(new Error('network'), { code: 'app/network-error' });
    const [kind, uid, email] = token.split(':');
    if (kind !== 'test' || !uid) throw Object.assign(new Error('bad'), { code: 'auth/argument-error' });
    return {
      uid,
      email,
      email_verified: Boolean(email),
      exp: Math.floor(Date.now() / 1000) + 3600,
      firebase: { sign_in_provider: email ? 'google.com' : 'phone' },
    };
  },
};

/**
 * @param {{ overrides?: Record<string, any>, modules?: any[], config?: Record<string, string> }} [opts]
 */
async function setup({ overrides = {}, modules = allModules, config: extraConfig = {} } = {}) {
  await resetDatabase();
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DB_HOST: db.host,
    DB_PORT: String(db.port),
    DB_NAME: db.database,
    DB_USER: db.user,
    DB_PASSWORD: db.password,
    REVENUECAT_WEBHOOK_AUTH: 'rc-test-secret',
    RATE_LIMIT_PER_MINUTE: '10000',
    ...extraConfig,
  });
  const calls = { firebaseDeleted: [], pushes: [], rcDeleted: [], osDeleted: [] };
  const deps = createContainer(config, {
    logger: createLogger({ level: 'error', write: () => {} }),
    verifier: fakeVerifier,
    firebaseUsers: { delete: async (uid) => void calls.firebaseDeleted.push(uid) },
    revenueCat: { enabled: false, getSubscriber: async () => ({ entitlements: {}, non_subscriptions: {} }), deleteSubscriber: async (id) => void calls.rcDeleted.push(id) },
    oneSignal: {
      enabled: true,
      send: async (msg) => {
        calls.pushes.push(msg);
        return { delivered: true };
      },
      deleteUser: async (id) => void calls.osDeleted.push(id),
    },
    ...overrides,
  });
  const app = createApp(deps, modules);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;

  /**
   * @param {string} method
   * @param {string} url
   * @param {{ token?: string, body?: unknown, headers?: Record<string, string> }} [opts]
   */
  async function request(method, url, { token, body, headers = {} } = {}) {
    const res = await fetch(`${base}${url}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  }

  return {
    deps,
    calls,
    base,
    request,
    async close() {
      await new Promise((r) => server.close(r));
      await deps.db.close();
    },
  };
}

module.exports = { setup, fakeVerifier, testDb: db };
