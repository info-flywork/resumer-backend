'use strict';

const { defineModule } = require('../../core/route');
const { PlanInfo } = require('./schemas');

module.exports = defineModule('plan', '/me', [
  {
    method: 'get',
    path: '/plan',
    summary: 'Abonelik planı özeti ve ücretsiz AI denemesi durumu',
    auth: 'required',
    response: PlanInfo,
    handler: ({ user, deps }) => deps.plan.getPlan(/** @type {any} */ (user)),
  },
]);
