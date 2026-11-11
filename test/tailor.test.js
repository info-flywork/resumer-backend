'use strict';

// tailor modülü testi: sözleşme (Flutter mock'ları), kimlik, sahiplik, doğrulama, iş kuralları, iş.
// Yapay zekâ ve ilan okuma sahte (deps.ai üzerinde) — gerçek ağ yok.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');
const { AppError } = require('../src/core/errors');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
/** @type {any} */
let aiOut;
let aiCalls = 0;
before(async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  t = await setup();
  t.deps.ai.fetchPageText = async (url) => {
    if (url.includes('bozuk')) throw new AppError(422, 'URL_UNREADABLE', 'Sayfa okunamadı');
    return 'Senior UI/UX Designer at Nova Teknoloji. Figma, prototyping.';
  };
  t.deps.ai.json = async () => {
    aiCalls += 1;
    if (aiOut instanceof Error) throw aiOut;
    return aiOut;
  };
});
after(async () => {
  delete process.env.OPENAI_API_KEY;
  await t.close();
});

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

const fx = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')).data;

const content = {
  template_id: 'modern',
  full_name: 'Emrah Doğan',
  email: 'emrah@example.com',
  location: 'İstanbul',
  summary: 'Eski özet.',
  experiences: [
    { company: 'Alfa', position: 'Designer', description: 'Eski açıklama.', start_date: '2021', currently_working: true },
    { company: 'Beta', position: 'Junior', description: 'İkinci iş.', start_date: '2019', end_date: '2021' },
  ],
  skills: ['Figma', 'Sketch'],
};

const aiResult = () => ({
  job_title: 'UI/UX Designer',
  company: 'Nova Teknoloji',
  current_score: 64,
  suggestions: [
    { id: 'summary', suggested: 'Yeni özet.', score_gain: 10 },
    { id: 'experience', suggested: 'Yeni açıklama.', score_gain: 8 },
    { id: 'skills', suggested: ' Figma, , Prototipleme ,Figma2 ', score_gain: 7 },
  ],
});

/** Kullanıcı + kayıtlı CV ekler */
async function seed(uid, over = {}) {
  await t.request('GET', '/cvs', { token: `test:${uid}` });
  const user = await t.deps.users.findByFirebaseUid(uid);
  const row = await t.deps.cvs.create(user, { title: 'Main CV', subtitle: 'Designer', template_id: 'modern', language: 'tr', content, score: 60, ...over });
  aiOut = aiResult();
  return { user, row, token: `test:${uid}` };
}

/** Ücretsiz AI denemesi duruyor mu (1) / kullanıldı mı (0) */
const trial = async (user) => ((await t.deps.plan.hasFreeTrial(user)) ? 1 : 0);
/** @param {{ id: string }} user */
const makePro = (user) => t.deps.db.run("INSERT INTO entitlements (user_id, entitlement, expires_at) VALUES (?, 'Resumer Pro', '2099-01-01')", [user.id]);

const analyze = (token, cv_id, job_url = 'https://jobs.test/ilan') => t.request('POST', '/tailor/analyze', { token, body: { job_url, cv_id } });

test('analyze sözleşmeye uyar; current alanları CV’den, ücretsiz deneme kullanılır', async () => {
  const { user, row, token } = await seed('an1');
  const before = await trial(user);
  const r = await analyze(token, row.id);
  assert.equal(r.status, 200);
  assertShape(r.body.data, fx('tailor_analysis.json'));
  const d = r.body.data;
  assert.equal(d.current_score, 64);
  assert.equal(d.new_score, 89);
  assert.deepEqual(d.suggestions.map((s) => s.id), ['summary', 'experience', 'skills']);
  assert.deepEqual(d.suggestions.map((s) => s.current), ['Eski özet.', 'Eski açıklama.', 'Figma, Sketch']);
  assert.ok(!('score_gain' in d.suggestions[0]));
  assert.equal(await trial(user), before - 1);
});

test('analyze: new_score 100’de sınırlanır; boş CV bölümü current ""', async () => {
  const { row, token } = await seed('an2', { content: { full_name: 'X' } });
  aiOut.current_score = 95;
  const r = await analyze(token, row.id);
  assert.equal(r.body.data.new_score, 100);
  assert.deepEqual(r.body.data.suggestions.map((s) => s.current), ['', '', '']);
});

test('analyze: kimlik, doğrulama, sahiplik, okunamayan URL', async () => {
  assert.equal((await t.request('POST', '/tailor/analyze', { body: {} })).status, 401);
  const { row, token } = await seed('an3');
  assert.equal((await t.request('POST', '/tailor/analyze', { token, body: { job_url: 'ftp://x.test', cv_id: row.id } })).status, 422);
  assert.equal((await t.request('POST', '/tailor/analyze', { token, body: { job_url: 'https://x.test' } })).status, 422);
  assert.equal((await t.request('POST', '/tailor/analyze', { token, body: { job_url: 'https://x.test', cv_id: row.id, x: 1 } })).status, 422);
  const other = await seed('an3b');
  const stolen = await analyze(other.token, row.id);
  assert.equal(stolen.status, 404);
  assert.equal(stolen.body.code, 'CV_NOT_FOUND');
  const user = await t.deps.users.findByFirebaseUid('an3');
  const left = await trial(user);
  const bad = await analyze(token, row.id, 'https://bozuk.test/x');
  assert.equal(bad.status, 422);
  assert.equal(bad.body.code, 'URL_UNREADABLE');
  assert.equal(await trial(user), left, 'deneme harcanmamalı');
});

test('analyze: AI hatası → 502 ve deneme geri gelir; bozuk çıktı da 502', async () => {
  const { user, row, token } = await seed('an4');
  const left = await trial(user);
  aiOut = new AppError(502, 'AI_FAILED', 'Yapay zekâ şu an yanıt veremedi');
  const r = await analyze(token, row.id);
  assert.equal(r.status, 502);
  assert.equal(r.body.code, 'AI_FAILED');
  aiOut = { job_title: 'x', company: '', current_score: 5, suggestions: [] };
  assert.equal((await analyze(token, row.id)).status, 502);
  assert.equal(await trial(user), left);
});

test('analyze: deneme bittiyse 403 PREMIUM_REQUIRED, AI çağrılmaz', async () => {
  const { user, row, token } = await seed('an5');
  await t.deps.plan.consumeAi(user, 'analysis', 'pre');
  const calls = aiCalls;
  const r = await analyze(token, row.id);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'PREMIUM_REQUIRED');
  assert.equal(aiCalls, calls);
});

test('analyze: anahtar yoksa 503 AI_NOT_CONFIGURED', async () => {
  const { row, token } = await seed('an6');
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const r = await analyze(token, row.id);
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'AI_NOT_CONFIGURED');
  } finally {
    process.env.OPENAI_API_KEY = key;
  }
});

test('apply: seçilenler uygulanır, sözleşme, yeniden çağrılabilir (kaynaktan yeniden hesap)', async () => {
  const { row, token } = await seed('ap1');
  await analyze(token, row.id);
  const r = await t.request('POST', '/tailor/apply', { token, body: { section_ids: ['summary', 'skills'] } });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fx('tailor_apply.json'));
  assert.equal(r.body.data.current_score, 64);
  assert.equal(r.body.data.new_score, 81);
  const sections = r.body.data.preview.sections;
  assert.equal(sections[0].items[0].body, 'Yeni özet.');
  assert.equal(sections.at(-1).items[0].meta, 'Figma · Prototipleme · Figma2');
  const again = await t.request('POST', '/tailor/apply', { token, body: { section_ids: ['experience'] } });
  assert.equal(again.body.data.new_score, 72);
  assert.equal(again.body.data.preview.sections[0].items[0].body, 'Eski özet.', 'önceki seçim kalmamalı');
  const none = await t.request('POST', '/tailor/apply', { token, body: { section_ids: [] } });
  assert.equal(none.body.data.new_score, 64);
  // Kaynak CV değişmez
  const src = await t.deps.cvs.getOwned(await t.deps.users.findByFirebaseUid('ap1'), row.id);
  assert.equal(src.content.summary, 'Eski özet.');
});

test('apply: experiences boşsa öneriden deneyim girdisi oluşturulur (puan eklenir)', async () => {
  const { row, token, user } = await seed('ap2', { content: { full_name: 'X', summary: 's' } });
  await analyze(token, row.id);
  const r = await t.request('POST', '/tailor/apply', { token, body: { section_ids: ['experience'] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.new_score, 72);
  const s = await t.deps.db.one('SELECT applied_content FROM tailor_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1', [user.id]);
  const applied = typeof s.applied_content === 'string' ? JSON.parse(s.applied_content) : s.applied_content;
  assert.equal(applied.experiences.length, 1);
});

test('apply: kimlik, doğrulama, oturum yok → 409', async () => {
  assert.equal((await t.request('POST', '/tailor/apply', { body: { section_ids: [] } })).status, 401);
  const { token } = await seed('ap3');
  assert.equal((await t.request('POST', '/tailor/apply', { token, body: { section_ids: [] } })).body.code, 'TAILOR_SESSION_NOT_FOUND');
  assert.equal((await t.request('POST', '/tailor/apply', { token, body: { section_ids: ['x'] } })).status, 422);
  assert.equal((await t.request('POST', '/tailor/apply', { token, body: { section_ids: ['summary', 'summary'] } })).status, 422);
  assert.equal((await t.request('POST', '/tailor/apply', { token, body: {} })).status, 422);
});

test('sahiplik: B, A’nın oturumunu uygulayamaz / kaydedemez', async () => {
  const a = await seed('ow1');
  await analyze(a.token, a.row.id);
  const b = await seed('ow2');
  assert.equal((await t.request('POST', '/tailor/apply', { token: b.token, body: { section_ids: ['summary'] } })).status, 409);
  assert.equal((await t.request('POST', '/tailor/save', { token: b.token })).body.code, 'TAILOR_SESSION_NOT_FOUND');
});

test('apply: 24 saatten eski oturum geçersiz', async () => {
  const { row, token, user } = await seed('ap4');
  await analyze(token, row.id);
  await t.deps.db.run('UPDATE tailor_sessions SET created_at = UTC_TIMESTAMP(3) - INTERVAL 25 HOUR WHERE user_id = ?', [user.id]);
  assert.equal((await t.request('POST', '/tailor/apply', { token, body: { section_ids: [] } })).status, 409);
});

test('save: uygulanmadan 409; sonra yeni CV, idempotent', async () => {
  assert.equal((await t.request('POST', '/tailor/save')).status, 401);
  const { user, row, token } = await seed('sv1');
  assert.equal((await t.request('POST', '/tailor/save', { token })).body.code, 'TAILOR_SESSION_NOT_FOUND');
  await analyze(token, row.id);
  const early = await t.request('POST', '/tailor/save', { token, body: {} });
  assert.equal(early.status, 409);
  assert.equal(early.body.code, 'TAILOR_NOT_APPLIED');
  await t.request('POST', '/tailor/apply', { token, body: { section_ids: ['summary', 'experience', 'skills'] } });
  const r = await t.request('POST', '/tailor/save', { token });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fx('tailor_save.json'));
  const cv = await t.deps.cvs.getOwned(user, r.body.data.cv_id);
  // Başlık: "<kişi> — <ilan pozisyonu>"; alt başlık uyarlanmış ilk deneyimin pozisyonu ya da ilan
  assert.match(cv.title, / — UI\/UX Designer$/);
  assert.ok(cv.subtitle);
  assert.equal(Boolean(cv.is_tailored), true);
  assert.equal(cv.score, 89);
  assert.equal(cv.template_id, 'modern');
  assert.equal(cv.language, 'tr');
  assert.equal(cv.source_cv_id, row.id);
  assert.equal(cv.content.summary, 'Yeni özet.');
  const again = await t.request('POST', '/tailor/save', { token });
  assert.equal(again.body.data.cv_id, r.body.data.cv_id);
  assert.equal((await t.deps.cvs.counts(user.id)).total, 2);
});

test('save: ücretsiz CV sınırında 403 CV_LIMIT_REACHED', async () => {
  const { user, row, token } = await seed('sv2');
  await analyze(token, row.id);
  await t.request('POST', '/tailor/apply', { token, body: { section_ids: ['summary'] } });
  await t.deps.cvs.create(user, { title: 'B', content });
  await t.deps.cvs.create(user, { title: 'C', content });
  const r = await t.request('POST', '/tailor/save', { token });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'CV_LIMIT_REACHED');
});

test('iş: 7 günden eski oturumlar silinir; kaynak CV silinince oturum da gider', async () => {
  const { user, row, token } = await seed('pg1');
  await makePro(user); // iki analiz → Pro (ücretsizde tek deneme)
  await analyze(token, row.id);
  await analyze(token, row.id);
  await t.deps.db.run('UPDATE tailor_sessions SET created_at = UTC_TIMESTAMP(3) - INTERVAL 8 DAY WHERE user_id = ? ORDER BY id LIMIT 1', [user.id]);
  assert.equal(await t.deps.tailor.purgeSessions(), 1);
  assert.equal((await t.deps.db.query('SELECT id FROM tailor_sessions WHERE user_id = ?', [user.id])).length, 1);
  await t.request('DELETE', `/cvs?id=${row.id}`, { token });
  assert.equal((await t.deps.db.query('SELECT id FROM tailor_sessions WHERE user_id = ?', [user.id])).length, 0);
});
