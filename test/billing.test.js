'use strict';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');
const products = require('../src/modules/billing/products');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
let userId;
const auth = { authorization: 'Bearer rc-test-secret' };

before(async () => {
  products.CONSUMABLES.credits_10 = {
    description: 'test',
    async grant(uid, conn) {
      await conn.query("INSERT INTO job_runs (name, last_error) VALUES (?, 'granted')", [`grant-${uid}-${Date.now()}`]);
      return { credits: 10 };
    },
  };
  t = await setup();
  userId = (await t.request('GET', '/account', { token: 'test:buyer' })).body.data.user.id;
});
after(async () => {
  delete products.CONSUMABLES.credits_10;
  await t.close();
});

const event = (o) => ({ event: { id: `ev-${Math.random()}`, app_user_id: userId, store: 'APP_STORE', ...o } });

test('webhook: yanlış / eksik yetki 401', async () => {
  assert.equal((await t.request('POST', '/billing/revenuecat/webhook', { body: event({ type: 'INITIAL_PURCHASE' }) })).status, 401);
  const wrong = await t.request('POST', '/billing/revenuecat/webhook', { body: event({ type: 'INITIAL_PURCHASE' }), headers: { authorization: 'Bearer nope' } });
  assert.equal(wrong.status, 401);
});

test('webhook: abonelik başlar → premium; aynı olay ikinci kez işlenmez; süre dolunca kapanır', async () => {
  const e = event({ type: 'INITIAL_PURCHASE', product_id: 'pro_monthly', entitlement_ids: ['premium'], expiration_at_ms: Date.now() + 86_400_000 });
  const r1 = await t.request('POST', '/billing/revenuecat/webhook', { body: e, headers: auth });
  assert.equal(r1.body.data.result, 'synced');
  const r2 = await t.request('POST', '/billing/revenuecat/webhook', { body: e, headers: auth });
  assert.equal(r2.body.data.result, 'duplicate');
  const ent = await t.request('GET', '/me/entitlements', { token: 'test:buyer' });
  assert.equal(ent.body.data.is_premium, true);
  assert.equal(ent.body.data.entitlements[0].id, 'premium');

  await t.request('POST', '/billing/revenuecat/webhook', { body: event({ type: 'EXPIRATION', entitlement_ids: ['premium'] }), headers: auth });
  assert.equal((await t.request('GET', '/me/entitlements', { token: 'test:buyer' })).body.data.is_premium, false);
});

test('tüketilebilir ürün işlem başına bir kez verilir', async () => {
  const e1 = event({ type: 'NON_RENEWING_PURCHASE', product_id: 'credits_10', transaction_id: 'tx-1' });
  const e2 = event({ type: 'NON_RENEWING_PURCHASE', product_id: 'credits_10', transaction_id: 'tx-1' }); // farklı olay, aynı işlem
  await t.request('POST', '/billing/revenuecat/webhook', { body: e1, headers: auth });
  await t.request('POST', '/billing/revenuecat/webhook', { body: e2, headers: auth });
  const rows = await t.deps.db.query('SELECT * FROM purchases WHERE user_id = ?', [userId]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].granted, { credits: 10 });
});

test('/billing/sync durumu RevenueCat\'ten okur (istemciye güvenmez)', async () => {
  t.deps.revenueCat.enabled = true;
  t.deps.revenueCat.getSubscriber = async (id) => {
    assert.equal(id, userId);
    return {
      entitlements: { premium: { expires_date: new Date(Date.now() + 3600_000).toISOString(), product_identifier: 'pro_yearly', store: 'play_store' } },
      non_subscriptions: { credits_10: [{ id: 'rc-1', store_transaction_id: 'tx-2', store: 'play_store', purchase_date: new Date().toISOString() }] },
    };
  };
  try {
    const r = await t.request('POST', '/billing/sync', { token: 'test:buyer' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.is_premium, true);
    assert.equal(r.body.data.entitlements[0].product_id, 'pro_yearly');
    assert.equal((await t.deps.db.query('SELECT * FROM purchases WHERE user_id = ?', [userId])).length, 2);
  } finally {
    t.deps.revenueCat.enabled = false;
  }
});

test('RevenueCat erişilemezse 503 (istemci tekrar dener)', async () => {
  t.deps.revenueCat.enabled = true;
  t.deps.revenueCat.getSubscriber = async () => {
    throw new Error('timeout');
  };
  try {
    const r = await t.request('POST', '/billing/sync', { token: 'test:buyer' });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'BILLING_UNAVAILABLE');
  } finally {
    t.deps.revenueCat.enabled = false;
  }
});
