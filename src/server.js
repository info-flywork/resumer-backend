'use strict';

const { getConfig } = require('./config/env');
const { createContainer } = require('./container');
const { createApp } = require('./app');
const { modules } = require('./modules');
const { pendingMigrations } = require('./db/migrate');

/**
 * API süreci (PM2 "api"). Zamanlanmış işler ve push gönderimi burada ÇALIŞMAZ — worker.js'te.
 * Bekleyen migration varsa açılmaz: önce `npm run migrate` (deploy.sh bunu yapar).
 */
async function main() {
  const config = getConfig();
  if (config.NODE_ENV === 'production' && !config.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT boş — canlıda giriş doğrulanamaz');
  }
  const deps = createContainer(config);
  const pending = await pendingMigrations(deps.db.pool);
  if (pending.length) {
    throw new Error(`Uygulanmamış migration var (${pending.map((m) => m.file).join(', ')}) — önce: npm run migrate`);
  }

  const app = createApp(deps, modules);
  const server = app.listen(config.PORT, () => {
    deps.logger.info('server_started', { port: config.PORT, env: config.NODE_ENV });
    // PM2 wait_ready: true ile birlikte — yeni süreç hazır olunca eskisi kapanır (kesintisiz reload)
    if (process.send) process.send('ready');
  });
  server.keepAliveTimeout = 65_000; // nginx keepalive'dan uzun

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    deps.logger.info('shutdown', { signal });
    server.close(async () => {
      await deps.db.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'startup_failed', message: err.message })}\n`);
  process.exit(1);
});
