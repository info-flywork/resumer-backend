'use strict';

// credits modülü testi: sözleşme (plan.json), kimlik, cüzdan / yenileme / harcama / iade, kredi paketleri.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');
const { COSTS } = require('../src/modules/credits/service');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

/** Mock JSON'daki her alan yanıtta aynı tipte var mı (Flutter modeli bunu okur) */
function assertShape(actual, mock, where = 'data') {
  if (mock === null || mock === undefined) return;
  if (Array.isArray(mock)) {
    assert.ok(Array.isArray(actual), `${where} liste olmalı`);
    if (mock.length && actual.length) assertShape(actual[0], mock[0], `${where}[0]`);
    return;
  }
  if (typeof mock === 'object') {
    for (const k of Object.keys(mock)) {
      assert.ok(actual && k in actual, `${where}.${k} yanıtta yok`);
      assertShape(actual[k], mock[k], `${where}.${k}`);
    }
    return;
  }
  if (actual !== null) assert.equal(typeof actual, typeof mock, `${where} tipi`);
}

const mockData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'plan.json'), 'utf8')).data;

/** Kullanıcıyı oluşturur (ilk kimlikli istek) ve satırını döner */
async function makeUser(uid) {
  await t.request('GET', '/me/plan', { token: `test:${uid}` });
  return t.deps.users.findByFirebaseUid(uid);
}

const ledger = (userId) => t.deps.db.query('SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at, delta', [userId]);

test('GET /me/plan sözleşmeye uyar; yeni kullanıcı Free + 3 kredi', async () => {
  const r = await t.request('GET', '/me/plan', { token: 'test:plan1' });
  assert.equal(r.status, 200);
  assertShape(r.body.data, mockData);
  assert.deepEqual(r.body.data, { name: 'Free', credits: 3, renews_on: '', is_active: false });
  const user = await t.deps.users.findByFirebaseUid('plan1');
  const rows = await ledger(user.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, 'welcome');
  // ikinci istek ikinci hoş geldin kaydı yazmaz
  await t.request('GET', '/me/plan', { token: 'test:plan1' });
  assert.equal((await ledger(user.id)).length, 1);
});

test('kimlik gerekli', async () => {
  assert.equal((await t.request('GET', '/me/plan')).status, 401);
});

test('premium: Resumer Pro adı, yenilenme tarihi, aylık 30 kredi (bir kez)', async () => {
  const user = await makeUser('pro1');
  await t.deps.db.run("INSERT INTO entitlements (user_id, entitlement, expires_at) VALUES (?, 'Resumer Pro', '2099-12-12 10:00:00')", [user.id]);
  const r = await t.request('GET', '/me/plan', { token: 'test:pro1' });
  assert.equal(r.body.data.name, 'Resumer Pro');
  assert.equal(r.body.data.credits, 30);
  assert.equal(r.body.data.is_active, true);
  const expected = new Intl.DateTimeFormat(user.locale || 'en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date('2099-12-12T10:00:00Z'));
  assert.equal(r.body.data.renews_on, expected);
  assertShape(r.body.data, mockData);
  await t.request('GET', '/me/plan', { token: 'test:pro1' });
  const rows = await ledger(user.id);
  assert.deepEqual(rows.map((x) => x.reason).sort(), ['monthly_refill', 'welcome']);
  assert.equal(rows.find((x) => x.reason === 'monthly_refill').delta, 27);
});

test('premium ömür boyu: renews_on boş; 30 günden eski yenileme tekrar tetiklenir', async () => {
  const user = await makeUser('life1');
  await t.deps.db.run("INSERT INTO entitlements (user_id, entitlement, expires_at) VALUES (?, 'Resumer Pro', NULL)", [user.id]);
  assert.equal((await t.request('GET', '/me/plan', { token: 'test:life1' })).body.data.renews_on, '');
  await t.deps.credits.consume(user, 30, 'analysis', 'a1');
  assert.equal(await t.deps.credits.getBalance(user), 0); // 30 gün dolmadı
  await t.deps.db.run('UPDATE user_wallets SET last_refill_at = UTC_TIMESTAMP(3) - INTERVAL 31 DAY WHERE user_id = ?', [user.id]);
  assert.equal(await t.deps.credits.getBalance(user), 30);
});

test('consume: bakiye düşer, ledger yazılır; yetmezse 403 INSUFFICIENT_CREDITS', async () => {
  const user = await makeUser('spend1');
  assert.equal(await t.deps.credits.consume(user, COSTS.analysis, 'analysis', 'cv-1'), 2);
  await t.deps.credits.consume(user, 1, 'tailor', 'cv-2');
  await t.deps.credits.consume(user, 1, 'translation', 'cv-3');
  await assert.rejects(
    () => t.deps.credits.consume(user, 1, 'portrait', 'cv-4'),
    (/** @type {any} */ e) => e.status === 403 && e.code === 'INSUFFICIENT_CREDITS',
  );
  assert.equal(await t.deps.credits.getBalance(user), 0);
  const rows = await ledger(user.id);
  assert.equal(rows.filter((x) => x.delta < 0).length, 3);
  assert.equal(rows.find((x) => x.reason === 'translation').balance_after, 0);
});

test('eşzamanlı harcama çift harcama yapmaz', async () => {
  const user = await makeUser('race1');
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => t.deps.credits.consume(user, 1, 'analysis', `r${i}`)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal(await t.deps.credits.getBalance(user), 0);
});

test('refund: iade edilir, aynı refId için ikinci iade yapılmaz', async () => {
  const user = await makeUser('refund1');
  await t.deps.credits.consume(user, 1, 'analysis', 'job-1');
  assert.equal(await t.deps.credits.refund(user, 1, 'job-1'), 3);
  assert.equal(await t.deps.credits.refund(user, 1, 'job-1'), 3);
  assert.equal((await ledger(user.id)).filter((x) => x.reason === 'refund').length, 1);
});

test('kredi paketleri: satın alım bakiyeye eklenir, aynı işlem iki kez eklenmez; cüzdansız kullanıcıda 3+N', async () => {
  const user = await makeUser('buy1');
  await t.deps.billing.grantConsumable(user.id, 'resumer_credits_10', 'tx-buy-1', 'app_store');
  assert.equal(await t.deps.credits.getBalance(user), 13);
  const dup = await t.deps.billing.grantConsumable(user.id, 'resumer_credits_10', 'tx-buy-1', 'app_store');
  assert.equal(dup.granted, false);
  await t.deps.billing.grantConsumable(user.id, 'resumer_credits_50', 'tx-buy-2', 'app_store');
  assert.equal(await t.deps.credits.getBalance(user), 63);
  const purchases = (await ledger(user.id)).filter((x) => x.reason === 'purchase');
  assert.deepEqual(purchases.map((x) => [x.delta, x.ref_id]), [[10, 'tx-buy-1'], [50, 'tx-buy-2']]);

  // cüzdanı hiç oluşmamış kullanıcı: 3 + 10
  const fresh = await makeUser('buy2');
  await t.deps.db.run('DELETE FROM user_wallets WHERE user_id = ?', [fresh.id]);
  await t.deps.billing.grantConsumable(fresh.id, 'resumer_credits_10', 'tx-buy-3', 'app_store');
  assert.equal(await t.deps.credits.getBalance(fresh), 13);
});

test('sahiplik: kullanıcının bakiyesi başkasınınkini etkilemez', async () => {
  const a = await makeUser('own-a');
  await makeUser('own-b');
  await t.deps.credits.consume(a, 2, 'analysis', 'x');
  assert.equal((await t.request('GET', '/me/plan', { token: 'test:own-a' })).body.data.credits, 1);
  assert.equal((await t.request('GET', '/me/plan', { token: 'test:own-b' })).body.data.credits, 3);
});
