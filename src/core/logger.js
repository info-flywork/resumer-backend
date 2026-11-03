'use strict';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

/** Bu anahtarlar loga asla açık yazılmaz (KVKK / güvenlik). */
const SECRET_KEY = /(pass(word)?|token|secret|authorization|cookie|api_?key|private)/i;
const PII_KEY = /(email|e_mail|phone|full_?name|first_?name|last_?name|birth|address|ip_?address)/i;

/**
 * @param {unknown} value
 * @param {number} depth
 * @returns {unknown}
 */
function redact(value, depth = 0) {
  if (value instanceof Error) {
    return { message: value.message, code: /** @type {any} */ (value).code, stack: value.stack };
  }
  if (!value || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY.test(k)) out[k] = '[gizli]';
    else if (PII_KEY.test(k)) out[k] = v == null ? v : '[kişisel]';
    else out[k] = redact(v, depth + 1);
  }
  return out;
}

/**
 * JSON satır logları (PM2 / logrotate ile uyumlu). Kişisel veri ve sırlar maskelenir.
 * @param {{ level?: keyof LEVELS, base?: Record<string, unknown>, write?: (line: string, level: string) => void }} [opts]
 */
function createLogger({ level = 'info', base = {}, write } = {}) {
  const max = LEVELS[level] ?? LEVELS.info;
  const out =
    write ||
    ((line, lvl) => (lvl === 'error' ? process.stderr : process.stdout).write(`${line}\n`));

  /**
   * @param {string} lvl
   * @param {string} msg
   * @param {unknown} [meta]
   */
  function log(lvl, msg, meta) {
    if ((LEVELS[lvl] ?? 9) > max) return;
    /** @type {Record<string, unknown>} */
    const entry = { ts: new Date().toISOString(), level: lvl, msg, ...base };
    if (meta !== undefined) {
      const m = redact(meta);
      if (m && typeof m === 'object' && !Array.isArray(m)) Object.assign(entry, m);
      else entry.meta = m;
    }
    out(JSON.stringify(entry), lvl);
  }

  return {
    /** @param {string} msg @param {unknown} [meta] */
    error: (msg, meta) => log('error', msg, meta),
    /** @param {string} msg @param {unknown} [meta] */
    warn: (msg, meta) => log('warn', msg, meta),
    /** @param {string} msg @param {unknown} [meta] */
    info: (msg, meta) => log('info', msg, meta),
    /** @param {string} msg @param {unknown} [meta] */
    debug: (msg, meta) => log('debug', msg, meta),
    /** @param {Record<string, unknown>} extra */
    child: (extra) => createLogger({ level, base: { ...base, ...extra }, write: out }),
  };
}

/** @typedef {ReturnType<typeof createLogger>} Logger */

module.exports = { createLogger, redact };
