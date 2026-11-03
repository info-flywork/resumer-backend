'use strict';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');
const { tick } = require('../src/worker');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

test('/auth/sync kullanıcıyı oluşturur, ikinci kez aynı kullanıcıyı döndürür', async () => {
  const a = await t.request('POST', '/auth/sync', { token: 'test:u1:ayse@example.com' });
  assert.equal(a.status, 200);
  assert.equal(a.body.data.created, true);
  assert.equal(a.body.data.user.email, 'ayse@example.com');
  assert.equal(a.body.data.user.auth_provider, 'google');
  const b = await t.request('POST', '/auth/sync', { token: 'test:u1:ayse@example.com' });
  assert.equal(b.body.data.created, false);
  assert.equal(b.body.data.user.id, a.body.data.user.id);
});

test('aynı e-postayla başka Firebase kimliği başka hesap olur (e-postayla hesap ele geçirme yok)', async () => {
  const other = await t.request('POST', '/auth/sync', { token: 'test:attacker:ayse@example.com' });
  const victim = await t.deps.users.findByFirebaseUid('u1');
  assert.notEqual(other.body.data.user.id, victim.id);
});

test('ilk istek /auth/sync olmasa da kullanıcı oluşur (GET /me)', async () => {
  const r = await t.request('GET', '/account', { token: 'test:u2' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.user.auth_provider, 'phone');
});

test('PATCH /me doğrular ve günceller', async () => {
  const bad = await t.request('PATCH', '/account', { token: 'test:u2', body: { locale: 'türkçe' } });
  assert.equal(bad.status, 422);
  const unknown = await t.request('PATCH', '/account', { token: 'test:u2', body: { role: 'admin' } });
  assert.equal(unknown.status, 422, 'bilinmeyen alan kabul edilmez');
  const ok = await t.request('PATCH', '/account', { token: 'test:u2', body: { display_name: 'Mehmet', locale: 'en' } });
  assert.equal(ok.body.data.user.display_name, 'Mehmet');
  assert.equal(ok.body.data.user.locale, 'en');
});

test('hesap silme: hemen kapanır, worker kalıcı siler (Firebase + RevenueCat + OneSignal + DB)', async () => {
  const me = await t.request('GET', '/account', { token: 'test:del1' });
  const id = me.body.data.user.id;
  await t.deps.db.run("INSERT INTO entitlements (user_id, entitlement) VALUES (?, 'premium')", [id]);
  const del = await t.request('DELETE', '/account', { token: 'test:del1' });
  assert.equal(del.status, 200);
  const after = await t.request('GET', '/account', { token: 'test:del1' });
  assert.equal(after.status, 401);
  assert.equal(after.body.code, 'ACCOUNT_DELETED');

  t.deps.revenueCat.enabled = true;
  const ran = await tick(t.deps);
  t.deps.revenueCat.enabled = false;
  assert.ok(ran.includes('account-purge'));
  assert.deepEqual(t.calls.firebaseDeleted, ['del1']);
  assert.deepEqual(t.calls.rcDeleted, [id]);
  assert.deepEqual(t.calls.osDeleted, [id]);
  assert.equal(await t.deps.db.one('SELECT id FROM users WHERE id = ?', [id]), null);
  assert.equal((await t.deps.db.query('SELECT * FROM entitlements WHERE user_id = ?', [id])).length, 0, 'cascade');
});

test('bekleme süresi varsa yeniden giriş silmeyi iptal eder', async () => {
  const t2 = await setup({ config: { ACCOUNT_DELETION_GRACE_DAYS: '30' } });
  try {
    await t2.request('GET', '/account', { token: 'test:g1' });
    await t2.request('DELETE', '/account', { token: 'test:g1' });
    assert.equal((await t2.request('GET', '/account', { token: 'test:g1' })).status, 401, 'eski token ile istek hesabı geri getirmez');
    const back = await t2.request('POST', '/auth/sync', { token: 'test:g1' });
    assert.equal(back.status, 200);
    assert.equal((await t2.request('GET', '/account', { token: 'test:g1' })).status, 200);
    await tick(t2.deps);
    assert.deepEqual(t2.calls.firebaseDeleted, []);
  } finally {
    await t2.close();
  }
});
