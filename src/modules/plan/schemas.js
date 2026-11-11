'use strict';

const { z } = require('zod');

// Yanıt şeması Flutter'daki assets/mock/plan.json'un birebir karşılığıdır.
const PlanInfo = z.object({
  name: z.string(), // 'Resumer Pro' | 'Free'
  renews_on: z.string(), // kullanıcının dilinde tarih; ömür boyu / premium yoksa ''
  is_active: z.boolean(),
  free_trial_available: z.boolean(), // ücretsiz kullanıcının tek AI denemesi duruyor mu
});

module.exports = { PlanInfo };
