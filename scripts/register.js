'use strict';

/**
 * Uygulama modüllerini kaydeder: src/modules/<ad>/ klasörlerini tarar ve src/modules/app.generated.js'i
 * yeniden yazar. Ortak dosyalara (index.js, container.js, jobs, bildirim metinleri, ürünler) elle
 * dokunulmaz — böylece modüller birbirinden bağımsız (paralel) yazılabilir.
 *
 * Modül klasörü kuralları (yalnızca routes.js zorunlu):
 *   routes.js         module.exports = defineModule(...)
 *   service.js        exports.createService = (deps) => ({...})   → deps.<modülAdı> (camelCase)
 *   jobs.js           exports.jobs = [{ name, everyMs | dailyAtUtc, run }]
 *   notifications.js  exports.templates = { anahtar: { tr: {title, body}, en: {...} } }
 *   products.js       exports.entitlements = [...]; exports.consumables = { productId: { description, grant } }
 *   purge.js          exports.onPurge = async (user, deps) => {}   (hesap kalıcı silinirken: dosyalar vb.)
 *
 * Kullanım: npm run register   (kapılar her çalıştırmada bunu yapar)
 */
const fs = require('node:fs');
const path = require('node:path');

const MODULES = path.resolve(__dirname, '../src/modules');
const CORE = new Set(['health', 'auth', 'billing', 'notifications']);
const OUT = path.join(MODULES, 'app.generated.js');

const camel = (s) => s.replace(/[-_]+([a-z0-9])/g, (_, c) => c.toUpperCase());

const dirs = fs
  .readdirSync(MODULES, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !CORE.has(d.name) && /^[a-z][a-z0-9_-]*$/.test(d.name))
  .map((d) => d.name)
  .filter((n) => fs.existsSync(path.join(MODULES, n, 'routes.js')))
  .sort();

const has = (n, f) => fs.existsSync(path.join(MODULES, n, f));
const req = (n, f) => `require('./${n}/${f.replace(/\.js$/, '')}')`;

const lines = [
  "'use strict';",
  '',
  '// ÜRETİLDİ: scripts/register.js (npm run register) — elle düzenleme; modül klasörüne dosya ekle.',
  '',
  '/** @type {import(\'../core/route\').Module[]} */',
  `const modules = [${dirs.map((n) => `\n  ${req(n, 'routes.js')},`).join('')}${dirs.length ? '\n' : ''}];`,
  '',
  '/** @param {import(\'../container\').Container} c */',
  'function registerServices(c) {',
  ...dirs.filter((n) => has(n, 'service.js')).map((n) => `  c.${camel(n)} = ${req(n, 'service.js')}.createService(c);`),
  '}',
  '',
  '/** @type {import(\'../jobs\').Job[]} */',
  `const jobs = [${dirs.filter((n) => has(n, 'jobs.js')).map((n) => `\n  ...${req(n, 'jobs.js')}.jobs,`).join('')}\n];`,
  '',
  '/** @type {Record<string, Record<string, { title: string, body: string }>>} */',
  `const templates = Object.assign({}, ${dirs.filter((n) => has(n, 'notifications.js')).map((n) => `${req(n, 'notifications.js')}.templates`).join(', ') || '{}'});`,
  '',
  'const products = {',
  `  entitlements: [${dirs.filter((n) => has(n, 'products.js')).map((n) => `...(${req(n, 'products.js')}.entitlements || [])`).join(', ')}],`,
  `  consumables: Object.assign({}, ${dirs.filter((n) => has(n, 'products.js')).map((n) => `${req(n, 'products.js')}.consumables || {}`).join(', ') || '{}'}),`,
  '};',
  '',
  '/** @type {((user: any, deps: any) => Promise<void>)[]} */',
  `const purgeHooks = [${dirs.filter((n) => has(n, 'purge.js')).map((n) => `${req(n, 'purge.js')}.onPurge`).join(', ')}];`,
  '',
  'module.exports = { modules, registerServices, jobs, templates, products, purgeHooks };',
  '',
];

fs.writeFileSync(OUT, lines.join('\n'));
process.stdout.write(`app.generated.js: ${dirs.length} modül (${dirs.join(', ') || '-'})\n`);
