'use strict';

// cv_builder modülü testi: sözleşme (Flutter mock'ları), kimlik, doğrulama, puan kuralları, kaydetme / güncelleme.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');
const { scoreDraft } = require('../src/modules/cv_builder/service');

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

const fx = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')).data;

const long = 'x'.repeat(60);
const full = {
  template_id: 'modern',
  full_name: 'Alex Morgan',
  email: 'alex@email.com',
  phone: '+1 555 0100',
  location: 'New York',
  photo: 'https://cdn.example.com/a.png',
  summary: 's'.repeat(150),
  experiences: [{ company: 'Acme', position: 'Senior Designer', description: long, start_date: 'Ekim 2023', end_date: null, currently_working: true }],
  educations: [{ school: 'Parsons', degree: 'BA' }],
  skills: ['a', 'b', 'c', 'd', 'e'],
  certificates: [{ name: 'UX Cert' }],
  links: [{ url: 'linkedin.com/alex' }],
};

/** Kullanıcıyı oluşturur; user satırını döner */
async function user(uid) {
  await t.request('GET', '/cvs', { token: `test:${uid}` });
  const u = await t.deps.users.findByFirebaseUid(uid);
  await t.deps.db.run("UPDATE users SET locale = 'en' WHERE id = ?", [u.id]);
  u.locale = 'en';
  return u;
}

test('puan: sözleşmeye uyar, tam taslak 100', async () => {
  const r = await t.request('POST', '/cvs/score', { token: 'test:score', body: full });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fx('cv_score.json'));
  assert.equal(r.body.data.score, 100);
});

test('puan: boş taslak 0, kısmi kurallar', () => {
  assert.equal(scoreDraft({}), 0);
  assert.equal(scoreDraft({ full_name: 'A', summary: 'y'.repeat(40) }), 13);
  assert.equal(scoreDraft({ experiences: [{ description: 'kısa' }] }), 20);
  assert.equal(scoreDraft({ experiences: [{ description: long }, { description: 'kısa' }] }), 20);
  assert.equal(scoreDraft({ experiences: [{ description: long }] }), 25);
  assert.equal(scoreDraft({ skills: ['a'] }), 5);
  assert.equal(scoreDraft({ summary: 'y'.repeat(39) }), 0);
});

test('puan: kayıt yazmaz', async () => {
  await t.request('POST', '/cvs/score', { token: 'test:nowrite', body: full });
  const u = await t.deps.users.findByFirebaseUid('noway');
  assert.equal(u, null);
  const rows = await t.deps.db.query('SELECT COUNT(*) AS n FROM cvs');
  assert.equal(Number(rows[0].n), 0);
});

test('puan ve kaydetme: token yok → 401', async () => {
  assert.equal((await t.request('POST', '/cvs/score', { body: full })).status, 401);
  assert.equal((await t.request('POST', '/cv-builder/submit', { body: full })).status, 401);
});

test('doğrulama: fazla alan, geçersiz e-posta, uzun metin → 422', async () => {
  const tok = 'test:valid';
  assert.equal((await t.request('POST', '/cvs/score', { token: tok, body: { foo: 1 } })).status, 422);
  assert.equal((await t.request('POST', '/cvs/score', { token: tok, body: { email: 'abc' } })).status, 422);
  assert.equal((await t.request('POST', '/cvs/score', { token: tok, body: { email: '' } })).status, 200);
  assert.equal((await t.request('POST', '/cvs/score', { token: tok, body: { full_name: 'a'.repeat(101) } })).status, 422);
  const r = await t.request('POST', '/cv-builder/submit', { token: tok, body: { skills: ['x'.repeat(61)] } });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'VALIDATION_ERROR');
});

test('kaydet: sözleşmeye uyar, CV saved olarak oluşur', async () => {
  const u = await user('submit');
  const r = await t.request('POST', '/cv-builder/submit', {
    token: 'test:submit',
    body: { ...full, pending_certificate: { name: 'Bekleyen' } },
  });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fx('cv_build_submit.json'));
  const row = await t.deps.cvs.getOwned(u, r.body.data.id);
  assert.equal(row.title, 'Alex Morgan CV');
  assert.equal(row.subtitle, 'Senior Designer');
  assert.equal(row.status, 'saved');
  assert.equal(row.score, 100);
  assert.equal(row.content.pending_certificate, undefined);
  assert.equal(row.content.full_name, 'Alex Morgan');
});

test('kaydet: ad boş → 422 FULL_NAME_REQUIRED', async () => {
  const r = await t.request('POST', '/cv-builder/submit', { token: 'test:noname', body: { full_name: '  ' } });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'FULL_NAME_REQUIRED');
});

test('kaydet: bilinmeyen şablon 422, premium şablon Pro olmayana 403', async () => {
  const u = await user('tpl');
  let r = await t.request('POST', '/cv-builder/submit', { token: 'test:tpl', body: { full_name: 'A', template_id: 'yok' } });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'TEMPLATE_NOT_FOUND');
  r = await t.request('POST', '/cv-builder/submit', { token: 'test:tpl', body: { full_name: 'A', template_id: 'executive' } });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'PREMIUM_REQUIRED');
  await t.deps.db.run("INSERT INTO entitlements (user_id, entitlement) VALUES (?, 'Resumer Pro')", [u.id]);
  r = await t.request('POST', '/cv-builder/submit', { token: 'test:tpl', body: { full_name: 'A', template_id: 'executive' } });
  assert.equal(r.status, 200);
});

test('kaydet: ücretsiz planda 4. CV → 403 CV_LIMIT_REACHED', async () => {
  await user('limit');
  for (let i = 0; i < 3; i++) {
    assert.equal((await t.request('POST', '/cv-builder/submit', { token: 'test:limit', body: { full_name: `K${i}` } })).status, 200);
  }
  const r = await t.request('POST', '/cv-builder/submit', { token: 'test:limit', body: { full_name: 'K4' } });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'CV_LIMIT_REACHED');
});

test('güncelle: cv_id ile başlık korunur, alt başlık ve puan güncellenir', async () => {
  const u = await user('upd');
  const created = await t.request('POST', '/cv-builder/submit', { token: 'test:upd', body: { full_name: 'Eski Ad' } });
  const id = created.body.data.id;
  await t.deps.db.run("UPDATE cvs SET title = 'Özel Başlık' WHERE id = ?", [id]);
  const r = await t.request('POST', `/cv-builder/submit?cv_id=${id}`, { token: 'test:upd', body: full });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.id, id);
  const row = await t.deps.cvs.getOwned(u, id);
  assert.equal(row.title, 'Özel Başlık');
  assert.equal(row.subtitle, 'Senior Designer');
  assert.equal(row.score, 100);
  assert.equal(row.content.full_name, 'Alex Morgan');
});

test('güncelle: analiz edilmiş CV puanı değişmez', async () => {
  const u = await user('analyzed');
  const created = await t.request('POST', '/cv-builder/submit', { token: 'test:analyzed', body: { full_name: 'A' } });
  const id = created.body.data.id;
  await t.deps.db.run('UPDATE cvs SET score = 42 WHERE id = ?', [id]);
  // analyses tablosu başka modülündür; testte yoksa en küçük hâliyle kurulur
  await t.deps.db.run(
    `CREATE TABLE IF NOT EXISTS analyses (id CHAR(36) NOT NULL PRIMARY KEY, user_id CHAR(36) NOT NULL, cv_id CHAR(36) NULL)`,
  );
  const cols = (await t.deps.db.query("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'analyses' AND is_nullable = 'NO' AND column_default IS NULL")).map((r) => r.c ?? r.COLUMN_NAME);
  const extra = cols.filter((c) => !['id', 'user_id', 'cv_id'].includes(c));
  const defaults = { source: 'cv', overall_score: 50, section_scores: '{}', ats: '{}' };
  await t.deps.db.run(
    `INSERT INTO analyses (id, user_id, cv_id${extra.map((c) => `, ${c}`).join('')}) VALUES (UUID(), ?, ?${extra.map(() => ', ?').join('')})`,
    [u.id, id, ...extra.map((c) => defaults[c] ?? '')],
  );
  const r = await t.request('POST', `/cv-builder/submit?cv_id=${id}`, { token: 'test:analyzed', body: full });
  assert.equal(r.status, 200);
  assert.equal((await t.deps.cvs.getOwned(u, id)).score, 42);
});

test('sahiplik: başkasının CV’si güncellenemez → 404 CV_NOT_FOUND', async () => {
  await user('owner');
  await user('intruder');
  const created = await t.request('POST', '/cv-builder/submit', { token: 'test:owner', body: { full_name: 'Sahip' } });
  const r = await t.request('POST', `/cv-builder/submit?cv_id=${created.body.data.id}`, { token: 'test:intruder', body: full });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'CV_NOT_FOUND');
  assert.equal((await t.request('POST', '/cv-builder/submit?cv_id=yok', { token: 'test:owner', body: full })).status, 404);
});
