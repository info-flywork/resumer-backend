'use strict';

// analyses modülü testi: yapay zekâ ve LinkedIn okuma sahte (deps.ai.json / deps.ai.fetchPageText) — gerçek ağ yok.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after, beforeEach } = require('node:test');
const { setup } = require('./helpers');
const { AppError } = require('../src/core/errors');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
let seq = 0;
const state = { fail: false, bad: false, page: 'LinkedIn profil metni', fix: /** @type {any} */ (null), jsonCalls: /** @type {any[]} */ ([]) };

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

const AI_ANALYSIS = {
  overall_score: 70,
  section_scores: [
    { key: 'experience', score: 92 },
    { key: 'education', score: 60 },
    { key: 'skills', score: 50 },
    { key: 'ats', score: 54 },
  ],
  recommendations: [
    { title: 'Beceri ekle', description: 'Eksik teknolojiler', priority: 'high', target_section: 'skills', suggested_text: 'TypeScript, Docker' },
    { title: 'Özet ekle', description: 'Üstte kısa özet', priority: 'medium', target_section: 'summary', suggested_text: null },
    { title: 'Rakam kullan', description: 'Sonuçları sayıyla anlat', priority: 'low', target_section: 'experience', suggested_text: 'Satışı %30 artırdı.' },
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
  t.deps.ai.fetchPageText = async () => state.page;
  t.deps.ai.json = async (o) => {
    state.jsonCalls.push(o);
    if (state.fail) throw new AppError(502, 'AI_FAILED', 'ai');
    if (o.schemaName === 'resume_analysis') return state.bad ? { overall_score: 500 } : structuredClone(AI_ANALYSIS);
    return structuredClone(state.fix);
  };
});
after(async () => {
  delete process.env.OPENAI_API_KEY;
  await t.close();
});
beforeEach(() => {
  state.fail = false;
  state.bad = false;
  state.page = 'LinkedIn profil metni';
  state.jsonCalls = [];
});

/** Yeni kullanıcı + CV (içerik dolu) */
async function userWithCv(content = {}) {
  seq += 1;
  const token = `test:an${seq}`;
  await t.request('GET', '/me/plan', { token }); // kullanıcıyı oluşturur (kredi cüzdanı: 3)
  const user = await t.deps.users.findByFirebaseUid(`an${seq}`);
  const cv = await t.deps.cvs.create(user, {
    title: 'Ahmet CV',
    content: {
      full_name: 'Ahmet Yılmaz',
      summary: 'Eski özet',
      skills: ['Python'],
      experiences: [{ company: 'Acme', position: 'Dev', description: 'Eski açıklama', start_date: '2020', end_date: '2022', currently_working: false }],
      educations: [],
      ...content,
    },
  });
  return { token, user, cv };
}

const credits = async (token) => (await t.request('GET', '/me/plan', { token })).body.data.credits;

test('analiz sözleşmeye uyar; kredi düşer, CV puanı güncellenir', async () => {
  const { token, cv } = await userWithCv();
  const r = await t.request('POST', '/analyses', { token, body: { cv_id: cv.id } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assertShape(r.body.data, fixture('analysis_result.json'));
  assert.equal(r.body.data.cv_id, cv.id);
  assert.equal(r.body.data.ats.score, 54);
  assert.equal(r.body.data.recommendations.length, 3);
  assert.equal('suggested_text' in r.body.data.recommendations[1], false);
  assert.equal(await credits(token), 2);
  const row = await t.deps.db.one('SELECT score FROM cvs WHERE id = ?', [cv.id]);
  assert.equal(Number(row.score), 70);
  assert.equal(await t.deps.analyses.countByUser(cv.user_id ?? (await t.deps.users.findByFirebaseUid(`an${seq}`)).id), 1);
  assert.equal(await t.deps.analyses.hasForCv(cv.id), true);
});

test('GET /analyses/latest: kayıtlı sonucu döner; yoksa 404', async () => {
  const { token, cv } = await userWithCv();
  const missing = await t.request('GET', `/analyses/latest?cv_id=${cv.id}`, { token });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, 'ANALYSIS_NOT_FOUND');
  const created = await t.request('POST', '/analyses', { token, body: { cv_id: cv.id } });
  assert.equal(created.status, 200);
  const latest = await t.request('GET', `/analyses/latest?cv_id=${cv.id}`, { token });
  assert.equal(latest.status, 200, JSON.stringify(latest.body));
  assert.equal(latest.body.data.id, created.body.data.id);
  assert.equal(latest.body.data.overall_score, created.body.data.overall_score);
  assert.equal(latest.body.data.recommendations.length, created.body.data.recommendations.length);
});

test('LinkedIn kaynağı: sayfa okunur, cv_id null döner', async () => {
  const { token } = await userWithCv();
  const r = await t.request('POST', '/analyses', { token, body: { linkedin_url: 'https://www.linkedin.com/in/ahmet' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.cv_id, null);
  assert.equal(state.jsonCalls[0].user, 'LinkedIn profil metni');
});

test('kimlik gerekli (401)', async () => {
  assert.equal((await t.request('POST', '/analyses', { body: { cv_id: 'x' } })).status, 401);
  assert.equal((await t.request('POST', '/analyses/fix', { body: { recommendation_id: 'x' } })).status, 401);
});

test('doğrulama: bilinmeyen alan, http / yabancı host, boş recommendation_id → 422', async () => {
  const token = 'test:an-val';
  assert.equal((await t.request('POST', '/analyses', { token, body: { cv_id: 'x', admin: true } })).status, 422);
  assert.equal((await t.request('POST', '/analyses', { token, body: { linkedin_url: 'http://linkedin.com/in/a' } })).status, 422);
  assert.equal((await t.request('POST', '/analyses', { token, body: { linkedin_url: 'https://evil.com/linkedin.com' } })).status, 422);
  assert.equal((await t.request('POST', '/analyses/fix', { token, body: {} })).status, 422);
});

test('kaynak kuralları: yok → SOURCE_REQUIRED, yalnız dosya adı → FILE_UPLOAD_NOT_SUPPORTED, okunamayan URL → URL_UNREADABLE', async () => {
  const token = 'test:an-src';
  const none = await t.request('POST', '/analyses', { token, body: {} });
  assert.equal(none.status, 422);
  assert.equal(none.body.code, 'SOURCE_REQUIRED');
  const file = await t.request('POST', '/analyses', { token, body: { file_name: 'cv.pdf' } });
  assert.equal(file.body.code, 'FILE_UPLOAD_NOT_SUPPORTED');
  const real = t.deps.ai.fetchPageText;
  t.deps.ai.fetchPageText = async () => {
    throw new AppError(422, 'URL_UNREADABLE', 'x');
  };
  const url = await t.request('POST', '/analyses', { token, body: { linkedin_url: 'https://linkedin.com/in/a' } });
  t.deps.ai.fetchPageText = real;
  assert.equal(url.status, 422);
  assert.equal(url.body.code, 'URL_UNREADABLE');
});

test('sahiplik: başkasının CV’si → 404 CV_NOT_FOUND, kredi düşmez', async () => {
  const owner = await userWithCv();
  const { token } = await userWithCv();
  const r = await t.request('POST', '/analyses', { token, body: { cv_id: owner.cv.id } });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'CV_NOT_FOUND');
  assert.equal(await credits(token), 3);
});

test('kredi yoksa 403 INSUFFICIENT_CREDITS', async () => {
  const { token, cv } = await userWithCv();
  for (let i = 0; i < 3; i += 1) assert.equal((await t.request('POST', '/analyses', { token, body: { cv_id: cv.id } })).status, 200);
  const r = await t.request('POST', '/analyses', { token, body: { cv_id: cv.id } });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'INSUFFICIENT_CREDITS');
});

test('yapay zekâ hatası ya da geçersiz çıktı → 502 ve kredi iade edilir', async () => {
  const { token, cv } = await userWithCv();
  state.fail = true;
  assert.equal((await t.request('POST', '/analyses', { token, body: { cv_id: cv.id } })).status, 502);
  assert.equal(await credits(token), 3);
  state.fail = false;
  state.bad = true;
  const r = await t.request('POST', '/analyses', { token, body: { cv_id: cv.id } });
  assert.equal(r.status, 502);
  assert.equal(r.body.code, 'AI_FAILED');
  assert.equal(await credits(token), 3);
});

test('anahtar yoksa 503 AI_NOT_CONFIGURED', async () => {
  const { token, cv } = await userWithCv();
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const r = await t.request('POST', '/analyses', { token, body: { cv_id: cv.id } });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'AI_NOT_CONFIGURED');
  } finally {
    process.env.OPENAI_API_KEY = key;
  }
});

/** Analiz yap, ilk önerinin id'sini döndür */
async function analyzed(cv, token, target) {
  const r = await t.request('POST', '/analyses', { token, body: { cv_id: cv.id } });
  const rec = r.body.data.recommendations[0];
  await t.deps.db.run('UPDATE analysis_recommendations SET target_section = ? WHERE id = ?', [target, rec.id]);
  return rec.id;
}

test('fix: özet bölümü güncellenir, kredi düşmez, ikinci kez 409 ALREADY_APPLIED', async () => {
  const { token, cv } = await userWithCv();
  const recId = await analyzed(cv, token, 'summary');
  const before = await credits(token);
  state.fix = { summary: 'Yeni özet' };
  const r = await t.request('POST', '/analyses/fix', { token, body: { recommendation_id: recId } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assertShape(r.body.data, fixture('recommendation_fix.json'));
  assert.equal(r.body.data.applied, true);
  assert.equal(r.body.data.suggested_text, 'Yeni özet');
  assert.equal(await credits(token), before);
  const row = await t.deps.db.one('SELECT content FROM cvs WHERE id = ?', [cv.id]);
  assert.equal(row.content.summary, 'Yeni özet');
  assert.equal(row.content.full_name, 'Ahmet Yılmaz');
  const again = await t.request('POST', '/analyses/fix', { token, body: { recommendation_id: recId } });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'ALREADY_APPLIED');
});

test('fix: deneyim bölümünde tarihler korunur, öğe sayısı değişirse 502', async () => {
  const { token, cv } = await userWithCv();
  const recId = await analyzed(cv, token, 'experience');
  state.fix = { experiences: [{ company: 'Acme', position: 'Kıdemli Dev', location: null, description: 'Yeni açıklama' }, { company: 'X', position: 'Y', location: null, description: 'Z' }] };
  assert.equal((await t.request('POST', '/analyses/fix', { token, body: { recommendation_id: recId } })).status, 502);
  state.fix = { experiences: [{ company: 'Acme', position: 'Kıdemli Dev', location: null, description: 'Yeni açıklama' }] };
  const r = await t.request('POST', '/analyses/fix', { token, body: { recommendation_id: recId } });
  assert.equal(r.status, 200);
  const row = await t.deps.db.one('SELECT content FROM cvs WHERE id = ?', [cv.id]);
  assert.equal(row.content.experiences[0].position, 'Kıdemli Dev');
  assert.equal(row.content.experiences[0].start_date, '2020');
});

test('fix: yetenekler bölümü', async () => {
  const { token, cv } = await userWithCv();
  const recId = await analyzed(cv, token, 'skills');
  state.fix = { skills: ['Python', 'Docker'] };
  assert.equal((await t.request('POST', '/analyses/fix', { token, body: { recommendation_id: recId } })).status, 200);
  const row = await t.deps.db.one('SELECT content FROM cvs WHERE id = ?', [cv.id]);
  assert.deepEqual(row.content.skills, ['Python', 'Docker']);
});

test('fix: yapay zekâ hatası → 502 ve öneri uygulanmamış kalır', async () => {
  const { token, cv } = await userWithCv();
  const recId = await analyzed(cv, token, 'summary');
  state.fail = true;
  assert.equal((await t.request('POST', '/analyses/fix', { token, body: { recommendation_id: recId } })).status, 502);
  const row = await t.deps.db.one('SELECT applied_at FROM analysis_recommendations WHERE id = ?', [recId]);
  assert.equal(row.applied_at, null);
});

test('fix: sahiplik → başkasının önerisi 404 RECOMMENDATION_NOT_FOUND', async () => {
  const owner = await userWithCv();
  const recId = await analyzed(owner.cv, owner.token, 'summary');
  const { token } = await userWithCv();
  state.fix = { summary: 'x' };
  const r = await t.request('POST', '/analyses/fix', { token, body: { recommendation_id: recId } });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'RECOMMENDATION_NOT_FOUND');
});

test('fix: LinkedIn analizi ya da silinmiş CV → 409 NO_CV_TO_FIX', async () => {
  const { token } = await userWithCv();
  const li = await t.request('POST', '/analyses', { token, body: { linkedin_url: 'https://linkedin.com/in/a' } });
  const r = await t.request('POST', '/analyses/fix', { token, body: { recommendation_id: li.body.data.recommendations[0].id } });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'NO_CV_TO_FIX');

  const second = await userWithCv();
  const recId = await analyzed(second.cv, second.token, 'summary');
  await t.deps.db.run('DELETE FROM cvs WHERE id = ?', [second.cv.id]); // FK: analyses.cv_id → NULL
  const del = await t.request('POST', '/analyses/fix', { token: second.token, body: { recommendation_id: recId } });
  assert.equal(del.status, 409);
  assert.equal(del.body.code, 'NO_CV_TO_FIX');
});

test('hesap silinince analizler de silinir (cascade)', async () => {
  const { token, user, cv } = await userWithCv();
  await t.request('POST', '/analyses', { token, body: { cv_id: cv.id } });
  await t.request('DELETE', '/account', { token });
  await t.deps.account.purgeDue();
  assert.equal((await t.deps.db.query('SELECT * FROM analyses WHERE user_id = ?', [user.id])).length, 0);
  assert.equal((await t.deps.db.query('SELECT * FROM analysis_recommendations WHERE user_id = ?', [user.id])).length, 0);
});
