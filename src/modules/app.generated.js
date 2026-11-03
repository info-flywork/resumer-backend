'use strict';

// ÜRETİLDİ: scripts/register.js (npm run register) — elle düzenleme; modül klasörüne dosya ekle.

/** @type {import('../core/route').Module[]} */
const modules = [
  require('./ai/routes'),
  require('./analyses/routes'),
  require('./content/routes'),
  require('./credits/routes'),
  require('./cv_builder/routes'),
  require('./cvs/routes'),
  require('./profile/routes'),
  require('./tailor/routes'),
  require('./tasks/routes'),
  require('./translations/routes'),
];

/** @param {import('../container').Container} c */
function registerServices(c) {
  c.ai = require('./ai/service').createService(c);
  c.analyses = require('./analyses/service').createService(c);
  c.content = require('./content/service').createService(c);
  c.credits = require('./credits/service').createService(c);
  c.cvBuilder = require('./cv_builder/service').createService(c);
  c.cvs = require('./cvs/service').createService(c);
  c.profile = require('./profile/service').createService(c);
  c.tailor = require('./tailor/service').createService(c);
  c.tasks = require('./tasks/service').createService(c);
  c.translations = require('./translations/service').createService(c);
}

/** @type {import('../jobs').Job[]} */
const jobs = [
  ...require('./cvs/jobs').jobs,
  ...require('./tailor/jobs').jobs,
  ...require('./tasks/jobs').jobs,
];

/** @type {Record<string, Record<string, { title: string, body: string }>>} */
const templates = Object.assign({}, {});

const products = {
  entitlements: [...(require('./credits/products').entitlements || [])],
  consumables: Object.assign({}, require('./credits/products').consumables || {}),
};

/** @type {((user: any, deps: any) => Promise<void>)[]} */
const purgeHooks = [require('./ai/purge').onPurge];

module.exports = { modules, registerServices, jobs, templates, products, purgeHooks };
