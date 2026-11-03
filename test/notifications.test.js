'use strict';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');
const { tick, isDue } = require('../src/worker');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

test('bildirim kuyruğa yazılır, worker kullanıcının dilinde gönderir', async () => {
  const tr = (await t.request('GET', '/account', { token: 'test:n-tr' })).body.data.user;
  const en = (await t.request('PATCH', '/account', { token: 'test:n-en', body: { locale: 'en' } })).body.data.user;
  await t.deps.notifications.notify(tr.id, 'welcome', { name: 'Ayşe' }, { data: { route: '/home' } });
  await t.deps.notifications.notify(en.id, 'welcome', { name: 'John' });
  assert.equal(t.calls.pushes.length, 0, 'istek içinde gönderilmez');
  await tick(t.deps);
  const byUser = Object.fromEntries(t.calls.pushes.map((p) => [p.userId, p]));
  assert.equal(byUser[tr.id].title, 'Hoş geldin Ayşe!');
  assert.deepEqual(byUser[tr.id].data, { route: '/home' });
  assert.equal(byUser[en.id].title, 'Welcome John!');
  const rows = await t.deps.db.query("SELECT status FROM push_outbox WHERE status = 'sent'");
  assert.equal(rows.length, 2);
});

test('geçici hata → tekrar denenir; kalıcı hata (4xx) → failed', async () => {
  const u = (await t.request('GET', '/account', { token: 'test:n-err' })).body.data.user;
  const original = t.deps.oneSignal.send;
  t.deps.oneSignal.send = async () => {
    throw Object.assign(new Error('OneSignal 503'), { retryable: true });
  };
  await t.deps.notifications.notify(u.id, 'welcome', {});
  await t.deps.notifications.processOutbox();
  let row = await t.deps.db.one('SELECT * FROM push_outbox WHERE user_id = ?', [u.id]);
  assert.equal(row.status, 'pending');
  assert.equal(row.attempts, 1);

  t.deps.oneSignal.send = async () => {
    throw Object.assign(new Error('OneSignal 400'), { retryable: false });
  };
  await t.deps.db.run('UPDATE push_outbox SET next_attempt_at = UTC_TIMESTAMP(3) WHERE id = ?', [row.id]);
  await t.deps.notifications.processOutbox();
  row = await t.deps.db.one('SELECT * FROM push_outbox WHERE id = ?', [row.id]);
  assert.equal(row.status, 'failed');
  t.deps.oneSignal.send = original;
});

test('bilinmeyen şablon ya da OneSignal kapalı → skipped (sonsuz deneme yok)', async () => {
  const u = (await t.request('GET', '/account', { token: 'test:n-skip' })).body.data.user;
  await t.deps.notifications.notify(u.id, 'yok_boyle_sablon', {});
  await t.deps.notifications.processOutbox();
  const row = await t.deps.db.one('SELECT * FROM push_outbox WHERE user_id = ?', [u.id]);
  assert.equal(row.status, 'skipped');
});

test('zamanlama: everyMs ve dailyAtUtc', () => {
  const now = new Date('2026-10-15T06:30:00Z');
  assert.equal(isDue({ name: 'a', everyMs: 60_000, run: async () => {} }, new Date('2026-10-15T06:29:30Z'), now), false);
  assert.equal(isDue({ name: 'a', everyMs: 60_000, run: async () => {} }, new Date('2026-10-15T06:29:00Z'), now), true);
  const daily = { name: 'd', dailyAtUtc: '06:00', run: async () => {} };
  assert.equal(isDue(daily, new Date('2026-10-14T06:00:01Z'), now), true);
  assert.equal(isDue(daily, new Date('2026-10-15T06:00:01Z'), now), false);
  assert.equal(isDue(daily, null, new Date('2026-10-15T05:59:00Z')), false);
});
