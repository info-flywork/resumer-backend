'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;

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

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')).data;

before(async () => {
  t = await setup();
});
after(() => t.close());

test('GET /me sözleşmeye uyar; satır yoksa varsayılanlar, INSERT etmez', async () => {
  const token = 'test:pf1:ali@example.com';
  const r = await t.request('GET', '/me', { token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assertShape(r.body.data, fixture('profile.json'));
  assert.equal(r.body.data.email, 'ali@example.com');
  assert.equal(r.body.data.name, '');
  assert.equal(r.body.data.avatar_url, null);
  assert.equal(r.body.data.is_pro, false);
  assert.deepEqual(r.body.data.stats, { cvs: 0, analyses: 0, tailored: 0 });
  const user = await t.deps.users.findByFirebaseUid('pf1');
  assert.equal(await t.deps.db.one('SELECT 1 AS ok FROM user_profiles WHERE user_id = ?', [user.id]), null);
});

test('GET /me: anonim girişte email boş; users.display_name / phone / photo_url yedek olur', async () => {
  const token = 'test:pf2';
  assert.equal((await t.request('GET', '/me', { token })).body.data.email, '');
  const user = await t.deps.users.findByFirebaseUid('pf2');
  await t.deps.db.run('UPDATE users SET display_name = ?, phone = ?, photo_url = ? WHERE id = ?', ['Veli', '+905550000000', 'https://x.test/p.png', user.id]);
  const d = (await t.request('GET', '/me', { token })).body.data;
  assert.equal(d.name, 'Veli');
  assert.equal(d.phone, '+905550000000');
  assert.equal(d.avatar_url, 'https://x.test/p.png');
});

test('GET /me: sayaçlar', async () => {
  const token = 'test:pf3';
  await t.request('GET', '/me', { token });
  const user = await t.deps.users.findByFirebaseUid('pf3');
  await t.deps.cvs.create(user, { title: 'CV', content: { full_name: 'A' } });
  const d = (await t.request('GET', '/me', { token })).body.data;
  assert.equal(d.stats.cvs, 1);
  assert.equal(d.stats.tailored, 0);
});

test('PATCH /me: alanlar yazılır, trim, boş ve null temizler, olmayan anahtar değişmez', async () => {
  const token = 'test:pf4:a@b.co';
  const r = await t.request('PATCH', '/me', {
    token,
    body: { name: '  Ayşe  ', title: 'Tasarımcı', phone: '+90 555', location: 'İstanbul', description: 'Merhaba', avatar_url: 'https://cdn.test/a.png' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assertShape(r.body.data, fixture('profile.json'));
  assert.equal(r.body.data.name, 'Ayşe');
  assert.equal(r.body.data.title, 'Tasarımcı');
  assert.equal(r.body.data.avatar_url, 'https://cdn.test/a.png');

  const r2 = await t.request('PATCH', '/me', { token, body: { title: '', location: null } });
  assert.equal(r2.body.data.title, '');
  assert.equal(r2.body.data.location, '');
  assert.equal(r2.body.data.name, 'Ayşe');
  assert.equal(r2.body.data.description, 'Merhaba');

  const r3 = await t.request('PATCH', '/me', { token, body: {} });
  assert.equal(r3.body.data.name, 'Ayşe');
  assert.equal((await t.request('GET', '/me', { token })).body.data.phone, '+90 555');
});

test('PATCH /me: email / is_pro / stats kabul edilir ama yok sayılır', async () => {
  const token = 'test:pf5:real@b.co';
  const r = await t.request('PATCH', '/me', {
    token,
    body: { name: 'X', email: 'fake@x.co', title: '', phone: '', location: '', description: '', avatar_url: null, is_pro: true, stats: { cvs: 50, analyses: null, tailored: 3 } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.email, 'real@b.co');
  assert.equal(r.body.data.is_pro, false);
  assert.equal('credits' in r.body.data, false);
  assert.equal(r.body.data.stats.cvs, 0);
});

test('PATCH /me doğrulama: uzun alan, http adresi, bilinmeyen alan → 422', async () => {
  const token = 'test:pf6';
  assert.equal((await t.request('PATCH', '/me', { token, body: { name: 'a'.repeat(101) } })).status, 422);
  assert.equal((await t.request('PATCH', '/me', { token, body: { phone: '1'.repeat(33) } })).status, 422);
  assert.equal((await t.request('PATCH', '/me', { token, body: { avatar_url: 'http://x.test/a.png' } })).status, 422);
  assert.equal((await t.request('PATCH', '/me', { token, body: { admin: true } })).status, 422);
});

test('profiller kullanıcıya özeldir (sahiplik)', async () => {
  await t.request('PATCH', '/me', { token: 'test:pf7a', body: { name: 'Birinci' } });
  const b = await t.request('GET', '/me', { token: 'test:pf7b' });
  assert.equal(b.body.data.name, '');
});

test('DELETE /me: data null, hesap silinmeye işaretlenir, tekrar çağrı 401', async () => {
  const token = 'test:pf8';
  const r = await t.request('DELETE', '/me', { token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assertShape(r.body, JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'profile_delete.json'), 'utf8')));
  assert.equal(r.body.data, null);
  const user = await t.deps.users.findByFirebaseUid('pf8');
  assert.ok(user.deleted_at);
  // Şablon kimlik katmanı silinmeye işaretli hesabı handler'dan önce reddeder
  const again = await t.request('DELETE', '/me', { token });
  assert.equal(again.status, 401);
  assert.equal(again.body.code, 'ACCOUNT_DELETED');
});

test('GET /cvs/stats sözleşmeye uyar ve /me.stats ile aynı', async () => {
  const token = 'test:pf9';
  await t.request('GET', '/me', { token });
  const user = await t.deps.users.findByFirebaseUid('pf9');
  await t.deps.cvs.create(user, { title: 'CV', content: { full_name: 'A' } });
  const r = await t.request('GET', '/cvs/stats', { token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assertShape(r.body.data, fixture('cv_stats.json'));
  assert.deepEqual(r.body.data, { total: 1, tailored: 0, analyses: 0 });
  const me = (await t.request('GET', '/me', { token })).body.data.stats;
  assert.equal(me.cvs, r.body.data.total);
});

test('kimlik gerekli (401)', async () => {
  for (const [m, u] of [['GET', '/me'], ['PATCH', '/me'], ['DELETE', '/me'], ['GET', '/cvs/stats']]) {
    assert.equal((await t.request(m, u, m === 'PATCH' ? { body: {} } : {})).status, 401, `${m} ${u}`);
  }
});
