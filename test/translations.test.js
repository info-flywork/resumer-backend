'use strict';

// translations modülü testi: OpenAI sahte (deps.fetch) — gerçek ağ yok.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
/** @type {any[]} */
const seen = [];
const state = { mode: 'ok' };

/** Sahte OpenAI: kaynağı "T:" önekiyle "çevirir"; bozuk modlar hata / eksik dizi döner */
async function fakeFetch(input, init = {}) {
  const url = String(input);
  if (!url.startsWith('https://api.openai.com/v1/chat/completions')) return new Response('yok', { status: 404 });
  const req = JSON.parse(init.body);
  seen.push(req);
  if (state.mode === 'fail') return new Response('{}', { status: 400 });
  const src = JSON.parse(req.messages[1].content);
  const tr = (v) => (typeof v === 'string' ? `T:${v}` : v);
  const c = src.content;
  const content = {
    ...c,
    // sahte model korunacak alanları da bozar; servis kaynaktan geri yazmalı
    email: 'bozuk@x.com',
    full_name: 'Bozuk',
    summary: tr(c.summary),
    skills: c.skills.map(tr),
    experiences: c.experiences.map((e) => ({ ...e, company: 'Bozuk', position: tr(e.position), description: tr(e.description), start_date: tr(e.start_date), currently_working: false })),
    educations: c.educations.map((e) => ({ ...e, school: 'Bozuk', degree: tr(e.degree) })),
  };
  if (state.mode === 'short') content.skills = [];
  const out = { detected_source_language: 'en', subtitle: tr(src.subtitle), content };
  return Response.json({ choices: [{ message: { content: JSON.stringify(out) } }] });
}

before(async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  t = await setup({ overrides: { fetch: fakeFetch, aiRetryDelayMs: 0 } });
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
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'translation_result.json'), 'utf8')).data;

const content = {
  template_id: 'modern',
  full_name: 'Alex Morgan',
  email: 'alex@email.com',
  phone: '+1 555 0100',
  summary: 'Designer.',
  experiences: [{ company: 'Acme', position: 'Senior Designer', description: 'Led redesign.', start_date: 'Jan 2021', end_date: null, currently_working: true }],
  educations: [{ school: 'Parsons', degree: 'BA', field_of_study: 'Design', period: '2014 - 2018' }],
  skills: ['Figma'],
  certificates: [],
  links: [{ url: 'linkedin.com/alex', logo: 'assets/linkedin.png' }],
};

/** Kullanıcı + CV ekler */
async function seed(uid, over = {}) {
  await t.request('GET', '/cvs', { token: `test:${uid}` });
  const user = await t.deps.users.findByFirebaseUid(uid);
  await t.deps.db.run("UPDATE users SET locale = 'en' WHERE id = ?", [user.id]);
  user.locale = 'en';
  const row = await t.deps.cvs.create(user, { title: 'Main CV', subtitle: 'Designer', content, score: 80, ...over });
  return { user, row };
}
const balance = async (uid) => t.deps.credits.getBalance(await t.deps.users.findByFirebaseUid(uid));
const post = (uid, body, token = `test:${uid}`) => t.request('POST', '/translations', { token, body });
const valid = (cv_id, over = {}) => ({ cv_id, target_language: 'de', keep_formatting: true, pro_terminology: false, ...over });

test('çeviri sözleşmeye uyar, draft CV oluşturur, 1 kredi düşer, korunan alanlar kaynaktan gelir', async () => {
  state.mode = 'ok';
  const { row } = await seed('ok1');
  const before = await balance('ok1');
  const r = await post('ok1', valid(row.id, { pro_terminology: true, keep_formatting: false }));
  assert.equal(r.status, 200);
  assertShape(r.body.data, fixture);
  assert.equal(r.body.data.title, 'Main CV (German)');
  assert.equal(r.body.data.subtitle, 'T:Designer');
  assert.equal(r.body.data.language, 'de');
  assert.match(r.body.data.updated_text, /^Updated /);
  assert.equal(await balance('ok1'), before - 1);

  const created = await t.deps.db.one('SELECT * FROM cvs WHERE id = ?', [r.body.data.cv_id]);
  assert.equal(created.status, 'draft');
  assert.equal(created.language, 'de');
  assert.equal(created.source_cv_id, row.id);
  assert.equal(created.score, 80);
  assert.equal(created.template_id, null);
  const c = typeof created.content === 'string' ? JSON.parse(created.content) : created.content;
  assert.equal(c.summary, 'T:Designer.');
  assert.equal(c.email, 'alex@email.com');
  assert.equal(c.full_name, 'Alex Morgan');
  assert.equal(c.experiences[0].company, 'Acme');
  assert.equal(c.experiences[0].currently_working, true);
  assert.equal(c.experiences[0].start_date, 'T:Jan 2021');
  assert.equal(c.educations[0].school, 'Parsons');
  assert.equal(c.links[0].logo, 'assets/linkedin.png');

  const sys = seen.at(-1).messages[0].content;
  assert.match(sys, /German/);
  assert.match(sys, /business usage/);
  assert.match(sys, /reorganized for fluency/);
  // kaynak dil boştu → tespit edilen dille güncellenir
  const src = await t.deps.db.one('SELECT language FROM cvs WHERE id = ?', [row.id]);
  assert.equal(src.language, 'en');
});

test('kimlik gerekli', async () => {
  assert.equal((await t.request('POST', '/translations', { body: valid('x') })).status, 401);
});

test('doğrulama: bilinmeyen dil / eksik alan / fazla alan / boş cv_id → 422', async () => {
  assert.equal((await post('v1', valid('x', { target_language: 'xx' }))).status, 422);
  assert.equal((await post('v1', { cv_id: 'x', target_language: 'de' })).status, 422);
  assert.equal((await post('v1', valid('x', { extra: 1 }))).status, 422);
  assert.equal((await post('v1', valid(''))).status, 422);
});

test('olmayan / başkasının CV’si 404 CV_NOT_FOUND ve kredi düşmez', async () => {
  const { row } = await seed('owner');
  await t.request('GET', '/cvs', { token: 'test:intruder' });
  const before = await balance('intruder');
  const r = await post('intruder', valid(row.id));
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'CV_NOT_FOUND');
  assert.equal(await balance('intruder'), before);
  assert.equal((await post('owner', valid('yok'))).status, 404);
});

test('kaynak dil = hedef dil → 422 SAME_LANGUAGE', async () => {
  const { row } = await seed('same', { language: 'de' });
  const r = await post('same', valid(row.id));
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'SAME_LANGUAGE');
});

test('draft CV de çevrilebilir', async () => {
  const { row } = await seed('draftsrc', { status: 'draft' });
  assert.equal((await post('draftsrc', valid(row.id, { target_language: 'tr' }))).status, 200);
});

test('yetersiz kredi → 403 INSUFFICIENT_CREDITS', async () => {
  const { user, row } = await seed('broke');
  await balance('broke'); // cüzdanı oluşturur
  await t.deps.db.run('UPDATE user_wallets SET credits = 0 WHERE user_id = ?', [user.id]);
  const r = await post('broke', valid(row.id));
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'INSUFFICIENT_CREDITS');
});

test('AI hatası → 502 AI_FAILED, kredi iade edilir, CV oluşmaz', async () => {
  const { user, row } = await seed('aifail');
  const before = await balance('aifail');
  for (const mode of ['fail', 'short']) {
    state.mode = mode;
    const r = await post('aifail', valid(row.id));
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'AI_FAILED');
    assert.equal(await balance('aifail'), before);
  }
  state.mode = 'ok';
  const n = await t.deps.db.one("SELECT COUNT(*) AS n FROM cvs WHERE user_id = ? AND status = 'draft'", [user.id]);
  assert.equal(Number(n.n), 0);
});

test('anahtar yoksa 503 AI_NOT_CONFIGURED ve kredi düşmez', async () => {
  const { row } = await seed('nokey');
  const before = await balance('nokey');
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const r = await post('nokey', valid(row.id));
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'AI_NOT_CONFIGURED');
  } finally {
    process.env.OPENAI_API_KEY = key;
  }
  assert.equal(await balance('nokey'), before);
});
