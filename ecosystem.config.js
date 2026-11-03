'use strict';

/**
 * PM2: iki süreç.
 *  - api: HTTP (tek kopya / fork — Redis olmadan rate limit ve token önbelleği süreç içinde).
 *    wait_ready: yeni süreç "ready" demeden eskisi kapanmaz → `pm2 reload` kesintisiz.
 *  - worker: push kuyruğu, hesap silme ve zamanlanmış işler (tek kopya).
 * Ayarlar .env'den okunur (uygulama kendisi yükler); burada sır yok.
 */
module.exports = {
  apps: [
    {
      name: 'resumer-api',
      script: 'src/server.js',
      exec_mode: 'fork',
      instances: 1,
      wait_ready: true,
      listen_timeout: 15000,
      kill_timeout: 12000,
      max_memory_restart: '512M',
      time: true,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'resumer-worker',
      script: 'src/worker.js',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 15000,
      max_memory_restart: '256M',
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
