'use strict';

// Uzun işler: `Prefer: respond-async` → 202 { task_id } + GET /jobs/:id. Yapay zekâ sahte (deps.ai.json) — gerçek ağ yok.
const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const { setup } = require('./helpers');
const { AppError } = require('../src/core/errors');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
let seq = 0;
const state = { fail: false, gate: /** @type {Promise<void> | null} */ (null) };
const ASYNC = { Prefer: 'respond-async' };

const AI_ANALYSIS = {
  overall_score: 70,
  section_scores: [
    { key: 'experience', score: 92 },
    { key: 'education', score: 60 },
    { key: 'skills', score: 50 },
    { key: 'ats', score: 54 },
  ],
  recommendations: [
    { title: 'Beceri ekle', description: 'Eksik', priority: 'high', target_section: 'skills', suggested_text: 'Docker' },
    { title: 'Özet ekle', description: 'Üstte kısa özet', priority: 'medium', target_section: 'summary', suggested_text: null },
    { title: 'Rakam kullan', description: 'Sonuçlar', priority: 'low', target_section: 'experience', suggested_text: null },
  ],
  ats: {
    found_keywords: ['Python'],
    missing_keywords: ['Docker'],
    format_checks: [
      { label: 'Standart yazı tipi', passed: true },
      { label: 'Tek sütun', passed: true },
      { label: 'Tablo yok', passed: true },
      { label: 'Standart başlıklar', passed: false },
    ],
  },
};

before(async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  t = await setup();
  t.deps.ai.json = async () => {
    if (state.gate) await state.gate;
    if (state.fail) throw new AppError(502, 'AI_FAILED', 'Yapay zekâ yanıt vermedi');
    return structuredClone(AI_ANALYSIS);
  };
});
after(async () => {
  delete process.env.OPENAI_API_KEY;
  await t.close();
});
beforeEach(() => {
  state.fail = false;
  state.gate = null;
});

async function userWithCv() {
  seq += 1;
  const token = `test:job${seq}`;
  await t.request('GET', '/me/plan', { token });
  const user = await t.deps.users.findByFirebaseUid(`job${seq}`);
  const cv = await t.deps.cvs.create(user, { title: 'CV', content: { full_name: 'Ayşe', skills: ['Python'], experiences: [], educations: [] } });
  return { token, user, cv };
}

/** İş bitene (ya da hata verene) kadar sorar */
async function poll(token, id) {
  for (let i = 0; i < 100; i++) {
    const r = await t.request('GET', `/jobs/${id}`, { token });
    if (r.status !== 200 || r.body.data.status === 'done') return r;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error('iş bitmedi');
}

const credits = async (token) => (await t.request('GET', '/me/plan', { token })).body.data.credits;

test('başlıksız istek eskisi gibi bekler (eski uygulama sürümleri)', async () => {
  const { token, cv } = await userWithCv();
  const r = await t.request('POST', '/analyses', { token, body: { cv_id: cv.id } });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.overall_score, 70);
});

test('respond-async: hemen 202, iş sürerken running, bitince sonuç eşzamanlı uçla aynı', async () => {
  const { token, cv } = await userWithCv();
  let release = () => {};
  state.gate = new Promise((res) => (release = res));
  const r = await t.request('POST', '/analyses', { token, body: { cv_id: cv.id }, headers: ASYNC });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.equal(r.body.data.status, 'queued');
  assert.equal(r.body.data.eta_s, 25);
  const id = r.body.data.task_id;

  const mid = await t.request('GET', `/jobs/${id}`, { token });
  assert.equal(mid.status, 200);
  assert.ok(['queued', 'running'].includes(mid.body.data.status));
  assert.equal(mid.body.data.result, null);

  release();
  const done = await poll(token, id);
  assert.equal(done.status, 200);
  assert.equal(done.body.data.status, 'done');
  assert.equal(done.body.data.progress, 100);
  assert.equal(done.body.data.result.overall_score, 70);
  assert.equal(done.body.data.result.cv_id, cv.id);
  assert.equal(await credits(token), 2);
});

test('iş hatası GET /jobs/:id\'de işin kendi hatası olarak döner; kredi iade edilir', async () => {
  const { token, cv } = await userWithCv();
  state.fail = true;
  const r = await t.request('POST', '/analyses', { token, body: { cv_id: cv.id }, headers: ASYNC });
  assert.equal(r.status, 202);
  const done = await poll(token, r.body.data.task_id);
  assert.equal(done.status, 502);
  assert.equal(done.body.code, 'AI_FAILED');
  assert.equal(await credits(token), 3);
});

test('kredi yetmezse 403 INSUFFICIENT_CREDITS (istemci paywall açar)', async () => {
  const { token, user, cv } = await userWithCv();
  await t.deps.db.run('UPDATE user_wallets SET credits = 0 WHERE user_id = ?', [user.id]);
  const r = await t.request('POST', '/analyses', { token, body: { cv_id: cv.id }, headers: ASYNC });
  const done = await poll(token, r.body.data.task_id);
  assert.equal(done.status, 403);
  assert.equal(done.body.code, 'INSUFFICIENT_CREDITS');
});

test('girdi doğrulaması kuyruktan önce: 422, iş oluşmaz', async () => {
  const { token, user } = await userWithCv();
  const r = await t.request('POST', '/analyses', { token, body: { cv_id: 'x', admin: true }, headers: ASYNC });
  assert.equal(r.status, 422);
  const n = await t.deps.db.one('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?', [user.id]);
  assert.equal(Number(n.n), 0);
});

test('başkasının işi görünmez (404); kimlik gerekli (401); geçersiz id 422', async () => {
  const a = await userWithCv();
  const other = 'test:job-other';
  const r = await t.request('POST', '/analyses', { token: a.token, body: { cv_id: a.cv.id }, headers: ASYNC });
  await poll(a.token, r.body.data.task_id);
  assert.equal((await t.request('GET', `/jobs/${r.body.data.task_id}`, { token: other })).status, 404);
  assert.equal((await t.request('GET', `/jobs/${r.body.data.task_id}`)).status, 401);
  assert.equal((await t.request('GET', '/jobs/nope', { token: a.token })).status, 422);
});

test('temizlik: takılan iş başarısız olur (yeniden çalıştırılmaz), 7 günden eski iş silinir', async () => {
  const { token, user } = await userWithCv();
  const stuck = '00000000-0000-4000-8000-000000000001';
  const old = '00000000-0000-4000-8000-000000000002';
  await t.deps.db.run(
    `INSERT INTO tasks (id, user_id, kind, status, updated_at) VALUES
     (?, ?, 'POST /analyses', 'running', UTC_TIMESTAMP(3) - INTERVAL 6 MINUTE)`, [stuck, user.id]);
  await t.deps.db.run(
    `INSERT INTO tasks (id, user_id, kind, status, created_at) VALUES
     (?, ?, 'POST /analyses', 'done', UTC_TIMESTAMP(3) - INTERVAL 8 DAY)`, [old, user.id]);
  const out = await t.deps.tasks.cleanup();
  assert.ok(out.failed >= 1 && out.purged >= 1);
  const r = await t.request('GET', `/jobs/${stuck}`, { token });
  assert.equal(r.status, 500);
  assert.equal(r.body.code, 'TASK_FAILED');
  assert.equal((await t.request('GET', `/jobs/${old}`, { token })).status, 404);
});
