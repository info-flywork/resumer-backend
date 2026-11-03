'use strict';

const { getConfig } = require('./config/env');
const { createContainer } = require('./container');
const { jobs: defaultJobs } = require('./jobs');

/**
 * İş zamanı geldi mi?
 * @param {import('./jobs').Job} job
 * @param {Date | null} lastStarted
 * @param {Date} now
 */
function isDue(job, lastStarted, now) {
  if (job.everyMs) return !lastStarted || now.getTime() - lastStarted.getTime() >= job.everyMs;
  if (job.dailyAtUtc) {
    const [h, m] = job.dailyAtUtc.split(':').map(Number);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m));
    return now >= today && (!lastStarted || lastStarted < today);
  }
  return false;
}

/**
 * Tek tur: zamanı gelen her işi (kilit alabilirse) çalıştırır ve job_runs'a yazar.
 * @param {import('./container').Container} deps
 * @param {import('./jobs').Job[]} [jobs]
 * @param {Date} [now]
 */
async function tick(deps, jobs = defaultJobs, now = new Date()) {
  const ran = [];
  for (const job of jobs) {
    const row = await deps.db.one('SELECT last_started_at FROM job_runs WHERE name = ?', [job.name]);
    if (!isDue(job, row?.last_started_at ? new Date(row.last_started_at) : null, now)) continue;
    const conn = await deps.db.pool.getConnection();
    try {
      const [[lock]] = /** @type {any} */ (await conn.query('SELECT GET_LOCK(?, 0) AS ok', [`job:${job.name}`]));
      if (lock.ok !== 1) continue;
      await deps.db.run(
        `INSERT INTO job_runs (name, last_started_at) VALUES (?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE last_started_at = UTC_TIMESTAMP(3)`,
        [job.name],
      );
      let error = null;
      try {
        const result = await job.run(deps);
        if (result && Object.values(result).some((v) => typeof v === 'number' && v > 0)) {
          deps.logger.info('job_done', { job: job.name, result });
        }
      } catch (err) {
        error = String(/** @type {Error} */ (err).message).slice(0, 1000);
        deps.logger.error('job_failed', { job: job.name, err });
      }
      await deps.db.run('UPDATE job_runs SET last_finished_at = UTC_TIMESTAMP(3), last_error = ? WHERE name = ?', [error, job.name]);
      ran.push(job.name);
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [`job:${job.name}`]).catch(() => {});
      conn.release();
    }
  }
  return ran;
}

async function main() {
  const config = getConfig();
  const deps = createContainer(config);
  deps.logger.info('worker_started', { jobs: defaultJobs.map((j) => j.name) });
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  while (!stopping) {
    try {
      await tick(deps);
    } catch (err) {
      deps.logger.error('worker_tick_failed', { err });
    }
    await new Promise((r) => setTimeout(r, config.WORKER_POLL_MS));
  }
  await deps.db.close().catch(() => {});
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`worker başlatılamadı: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { tick, isDue };
