'use strict';

const { defineModule } = require('../../core/route');
const { PlanInfo } = require('./schemas');

module.exports = defineModule('credits', '/me', [
  {
    method: 'get',
    path: '/plan',
    summary: 'Abonelik planı özeti ve AI kredi bakiyesi',
    auth: 'required',
    response: PlanInfo,
    handler: ({ user, deps }) => deps.credits.getPlan(/** @type {any} */ (user)),
  },
]);
