'use strict';

/**
 * Worker'ın çalıştırdığı işler. Her iş: ad, ne sıklıkla (everyMs) ya da günde bir kez (dailyAtUtc
 * "HH:MM"), ve run(deps). Aynı iş aynı anda iki yerde çalışmaz (MySQL kilidi).
 *
 * @typedef {{
 *   name: string,
 *   everyMs?: number,
 *   dailyAtUtc?: string,
 *   run: (deps: import('../container').Container) => Promise<unknown>,
 * }} Job
 */

/** @type {Job[]} */
const jobs = [
  { name: 'push-outbox', everyMs: 5_000, run: (deps) => deps.notifications.processOutbox() },
  { name: 'account-purge', everyMs: 10 * 60_000, run: (deps) => deps.account.purgeDue() },
  // uygulama işleri: modül klasöründeki jobs.js (scripts/register.js)
  ...require('../modules/app.generated').jobs,
];

module.exports = { jobs };
