'use strict';

// plan modülü testi: sözleşme (plan.json), kimlik, Pro sınırsız, ücretsiz kullanıcıya toplam 1 AI denemesi.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');

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

const trialRows = (userId) => t.deps.db.query('SELECT * FROM ai_trial_uses WHERE user_id = ?', [userId]);
const premiumRequired = (/** @type {any} */ e) => e.status === 403 && e.code === 'PREMIUM_REQUIRED';

/** @param {{ id: string }} user @param {string | null} expires */
const makePro = (user, expires = '2099-12-12 10:00:00') =>
  t.deps.db.run("INSERT INTO entitlements (user_id, entitlement, expires_at) VALUES (?, 'Resumer Pro', ?)", [user.id, expires]);

test('GET /me/plan sözleşmeye uyar; yeni kullanıcı Free + ücretsiz deneme', async () => {
  const r = await t.request('GET', '/me/plan', { token: 'test:plan1' });
  assert.equal(r.status, 200);
  assertShape(r.body.data, mockData);
  assert.deepEqual(r.body.data, { name: 'Free', renews_on: '', is_active: false, free_trial_available: true });
});

test('kimlik gerekli', async () => {
  assert.equal((await t.request('GET', '/me/plan')).status, 401);
});

test('premium: Resumer Pro adı ve yenilenme tarihi; deneme gösterilmez', async () => {
  const user = await makeUser('pro1');
  await makePro(user);
  const r = await t.request('GET', '/me/plan', { token: 'test:pro1' });
  assert.equal(r.body.data.name, 'Resumer Pro');
  assert.equal(r.body.data.is_active, true);
  assert.equal(r.body.data.free_trial_available, false);
  const expected = new Intl.DateTimeFormat(user.locale || 'en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date('2099-12-12T10:00:00Z'));
  assert.equal(r.body.data.renews_on, expected);
  assertShape(r.body.data, mockData);
});

test('premium ömür boyu: renews_on boş', async () => {
  const user = await makeUser('life1');
  await makePro(user, null);
  assert.equal((await t.request('GET', '/me/plan', { token: 'test:life1' })).body.data.renews_on, '');
});

test('ücretsiz: tüm AI özellikleri için toplam 1 deneme, sonra 403 PREMIUM_REQUIRED', async () => {
  const user = await makeUser('free1');
  await t.deps.plan.consumeAi(user, 'analysis', 'a-1');
  for (const reason of ['analysis', 'tailor', 'translation', 'portrait']) {
    await assert.rejects(() => t.deps.plan.consumeAi(user, reason, `x-${reason}`), premiumRequired);
  }
  assert.equal((await trialRows(user.id)).length, 1);
  assert.equal((await t.request('GET', '/me/plan', { token: 'test:free1' })).body.data.free_trial_available, false);
});

test('Pro: sınırsız, deneme hakkına dokunulmaz', async () => {
  const user = await makeUser('pro2');
  await makePro(user);
  for (let i = 0; i < 5; i++) await t.deps.plan.consumeAi(user, 'analysis', `p-${i}`);
  assert.equal((await trialRows(user.id)).length, 0);
});

test('abonelik biterse deneme kullanılmışsa tekrar 403', async () => {
  const user = await makeUser('lapsed1');
  await t.deps.plan.consumeAi(user, 'tailor', 't-1');
  await makePro(user, '2000-01-01 00:00:00');
  await assert.rejects(() => t.deps.plan.consumeAi(user, 'tailor', 't-2'), premiumRequired);
});

test('eşzamanlı istekler denemeyi iki kez kullanamaz', async () => {
  const user = await makeUser('race1');
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => t.deps.plan.consumeAi(user, 'analysis', `r${i}`)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await trialRows(user.id)).length, 1);
});

test('refund: başarısız işlemde deneme geri gelir; başka işlemin refId\'si etkisiz', async () => {
  const user = await makeUser('refund1');
  await t.deps.plan.consumeAi(user, 'analysis', 'job-1');
  await t.deps.plan.refundAi(user, 'other');
  assert.equal(await t.deps.plan.hasFreeTrial(user), false);
  await t.deps.plan.refundAi(user, 'job-1');
  assert.equal(await t.deps.plan.hasFreeTrial(user), true);
});

test('sahiplik: bir kullanıcının denemesi başkasınınkini etkilemez', async () => {
  const a = await makeUser('own-a');
  await makeUser('own-b');
  await t.deps.plan.consumeAi(a, 'analysis', 'x');
  assert.equal((await t.request('GET', '/me/plan', { token: 'test:own-a' })).body.data.free_trial_available, false);
  assert.equal((await t.request('GET', '/me/plan', { token: 'test:own-b' })).body.data.free_trial_available, true);
});
