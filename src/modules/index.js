'use strict';

/**
 * Tüm modüller. Yeni modül: src/modules/<ad>/routes.js (defineModule) → `npm run register` (bu dosyaya dokunma).
 * Sıra önemli değil; yollar çakışmamalı (testler kontrol eder).
 * @type {import('../core/route').Module[]}
 */
const modules = [
  require('./health/routes'),
  require('./auth/routes'),
  require('./billing/routes'),
  // uygulama modülleri: scripts/register.js üretir (npm run register)
  ...require('./app.generated').modules,
];

module.exports = { modules };
