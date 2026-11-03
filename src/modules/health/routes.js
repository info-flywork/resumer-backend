'use strict';

const { z } = require('zod');
const { defineModule } = require('../../core/route');
const { unavailable } = require('../../core/errors');

module.exports = defineModule('health', '', [
  {
    method: 'get',
    path: '/health',
    summary: 'Uygulama ve veritabanı ayakta mı (izleme / PM2 kontrolü)',
    auth: 'none',
    response: z.object({ ok: z.boolean(), db_latency_ms: z.number() }),
    async handler({ deps }) {
      const db = await deps.db.health();
      if (!db.ok) throw unavailable('Veritabanına ulaşılamıyor', 'DB_UNAVAILABLE');
      return { ok: true, db_latency_ms: db.latencyMs };
    },
  },
]);
