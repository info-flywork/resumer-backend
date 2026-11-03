'use strict';

// openapi.json üretir (repoya girer; Flutter repository'leri ve sözleşme testleri bunu okur).
// Veritabanına / Firebase'e bağlanmaz.
const fs = require('node:fs');
const path = require('node:path');
const { buildOpenApi } = require('../src/core/openapi');
const { modules } = require('../src/modules');
const pkg = require('../package.json');

const spec = buildOpenApi(modules, { title: pkg.description || pkg.name, version: pkg.version });
const out = path.resolve(__dirname, '../openapi.json');
fs.writeFileSync(out, `${JSON.stringify(spec, null, 2)}\n`);
const count = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0);
process.stdout.write(`openapi.json: ${count} uç\n`);
