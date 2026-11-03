'use strict';

const { z } = require('zod');
const { defineModule } = require('../../core/route');

const Task = z.object({
  id: z.string(),
  status: z.enum(['queued', 'running', 'done']),
  progress: z.number().int(),
  eta_s: z.number().int().nullable(),
  result: z.any(),
});

// Uzun işin durumu. İstemci 1 sn → 2 sn → 3 sn aralıkla sorar; iş başarısızsa cevap işin kendi hatasıdır.
module.exports = defineModule('tasks', '/jobs', [
  {
    method: 'get',
    path: '/:id',
    summary: 'Uzun işin durumu ve sonucu',
    auth: 'required',
    request: { params: z.object({ id: z.string().uuid() }) },
    response: Task,
    handler: ({ user, params, deps }) => deps.tasks.get(/** @type {any} */ (user), params.id),
  },
]);
