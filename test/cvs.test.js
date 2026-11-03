'use strict';

// cvs modülü testi: sözleşme (Flutter mock'ları), kimlik, sahiplik, doğrulama, iş kuralları, işler.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');
const { FREE_LIMIT, buildPreview } = require('../src/modules/cvs/service');

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

const content = {
  template_id: 'modern',
  full_name: 'Alex Morgan',
  email: 'alex@email.com',
  phone: '+1 555 0100',
  location: 'New York',
  summary: 'Designer.',
  experiences: [{ company: 'Acme', position: 'Senior Designer', description: 'Led redesign.', start_date: '2021', end_date: '2023', currently_working: true }],
  educations: [{ school: 'Parsons', degree: 'BA', field_of_study: 'Design', period: '2014 - 2018' }],
  skills: ['Figma', 'Sketch'],
  certificates: [{ name: 'UX Cert', issuer: 'Google' }],
  links: [{ url: 'linkedin.com/alex' }],
};

/** Kullanıcı + CV ekler */
async function seed(uid, over = {}) {
  await t.request('GET', '/cvs', { token: `test:${uid}` }); // kullanıcıyı oluşturur
  const user = await t.deps.users.findByFirebaseUid(uid);
  await t.deps.db.run("UPDATE users SET locale = 'en' WHERE id = ?", [user.id]);
  user.locale = 'en';
  const row = await t.deps.cvs.create(user, { title: 'Main CV', subtitle: 'Designer', content: over.content ?? content, score: 86, ...over });
  return { user, row };
}

test('liste sözleşmeye uyar; yalnızca saved, son güncellenen önce', async () => {
  const { user, row } = await seed('list');
  await t.deps.cvs.create(user, { title: 'Taslak', content, status: 'draft' });
  const r = await t.request('GET', '/cvs', { token: 'test:list' });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fx('cvs.json'));
  assert.deepEqual(r.body.data.items.map((i) => i.id), [row.id]);
  assert.equal(r.body.data.items[0].score, 86);
  assert.match(r.body.data.items[0].updated_text, /^Updated /);
  assert.equal((await t.request('GET', '/cvs?limit=0', { token: 'test:list' })).status, 422);
});

test('score yoksa null döner', async () => {
  await seed('noscore', { score: null });
  const r = await t.request('GET', '/cvs', { token: 'test:noscore' });
  assert.equal(r.body.data.items[0].score, null);
});

test('detay sözleşmeye uyar ve önizleme içerikten üretilir', async () => {
  // özetsiz içerik: mock'un ilk bölümü (Experience) ile aynı şekil karşılaştırılır
  const { row } = await seed('detail', { content: { ...content, summary: '' } });
  const r = await t.request('GET', `/cvs/detail?id=${row.id}`, { token: 'test:detail' });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fx('cv_detail.json'));
  const p = r.body.data.preview;
  assert.equal(p.name, 'Alex Morgan');
  assert.equal(p.title, 'Designer');
  assert.equal(p.contact, 'alex@email.com · +1 555 0100 · New York');
  assert.deepEqual(p.sections.map((s) => s.heading), ['Experience', 'Education', 'Skills', 'Certificates', 'Links']);
  assert.equal(p.sections[0].items[0].meta, 'Acme · 2021 - Present');
  assert.equal(p.sections[1].items[0].title, 'BA, Design');
});

test('buildPreview: boş bölüm atlanır, başlık boşsa ilk pozisyon, tr başlıkları', () => {
  const p = buildPreview({ full_name: 'A', experiences: [{ position: 'Dev', company: 'X' }] }, 'tr');
  assert.equal(p.title, 'Dev');
  assert.deepEqual(p.sections.map((s) => s.heading), ['Deneyim']);
  const full = buildPreview(content, 'en');
  assert.deepEqual(full.sections[0], { heading: 'Summary', items: [{ body: 'Designer.' }] });
});

test('draft CV detayda da görünür; olmayan id 404', async () => {
  const { user } = await seed('draftdetail');
  const d = await t.deps.cvs.create(user, { title: 'Çeviri', content, status: 'draft' });
  assert.equal((await t.request('GET', `/cvs/detail?id=${d.id}`, { token: 'test:draftdetail' })).status, 200);
  const r = await t.request('GET', '/cvs/detail?id=yok', { token: 'test:draftdetail' });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'CV_NOT_FOUND');
});

test('kopyalama: sözleşme, (Copy) başlığı, kaynak bağı, sınır', async () => {
  const { row } = await seed('dup');
  const r = await t.request('POST', '/cvs/duplicate', { token: 'test:dup', body: { id: row.id } });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fx('cv_duplicate.json'));
  assert.equal(r.body.data.title, 'Main CV (Copy)');
  assert.equal(r.body.data.score, 86);
  const copy = await t.deps.db.one('SELECT * FROM cvs WHERE id = ?', [r.body.data.id]);
  assert.equal(copy.source_cv_id, row.id);
  assert.equal(copy.status, 'saved');
  assert.equal((await t.request('POST', '/cvs/duplicate', { token: 'test:dup', body: { id: row.id, x: 1 } })).status, 422);
});

test('ücretsiz plan sınırı CV_LIMIT_REACHED; premium sınırsız', async () => {
  const { row } = await seed('limit');
  for (let i = 1; i < FREE_LIMIT; i += 1) assert.equal((await t.request('POST', '/cvs/duplicate', { token: 'test:limit', body: { id: row.id } })).status, 200);
  const blocked = await t.request('POST', '/cvs/duplicate', { token: 'test:limit', body: { id: row.id } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'CV_LIMIT_REACHED');
  const user = await t.deps.users.findByFirebaseUid('limit');
  await t.deps.db.run("INSERT INTO entitlements (user_id, entitlement) VALUES (?, 'Resumer Pro')", [user.id]);
  assert.equal((await t.request('POST', '/cvs/duplicate', { token: 'test:limit', body: { id: row.id } })).status, 200);
});

test('silme: sözleşme, kalıcı, ikinci silme 404', async () => {
  const { row } = await seed('del');
  const r = await t.request('DELETE', `/cvs?id=${row.id}`, { token: 'test:del' });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fx('cv_delete.json'));
  assert.equal(r.body.data.id, row.id);
  assert.equal((await t.request('DELETE', `/cvs?id=${row.id}`, { token: 'test:del' })).status, 404);
  assert.equal(await t.deps.db.one('SELECT id FROM cvs WHERE id = ?', [row.id]), null);
});

test('kaydet: draft Listeme alınır, başlık güncellenir, sınır, idempotent', async () => {
  const { user } = await seed('save');
  const d = await t.deps.cvs.create(user, { title: 'Çeviri', subtitle: 'Dev', content, status: 'draft' });
  const r = await t.request('POST', '/cvs', { token: 'test:save', body: { id: d.id, title: 'My New CV', subtitle: null, score: 5, updated_text: 'x', preview: { name: 'A', sections: [] } } });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fx('cv_save.json'));
  assert.equal(r.body.data.title, 'My New CV');
  assert.equal(r.body.data.subtitle, 'Dev');
  assert.equal((await t.deps.cvs.counts(user.id)).total, 2);
  const again = await t.request('POST', '/cvs', { token: 'test:save', body: { id: d.id, title: 'Yeni ad' } });
  assert.equal(again.body.data.title, 'Yeni ad');
  assert.equal((await t.deps.cvs.counts(user.id)).total, 2);

  // sınır: 3 kayıtlı varken draft kaydedilemez
  await t.deps.cvs.create(user, { title: 'Üç', content });
  const d2 = await t.deps.cvs.create(user, { title: 'Draft2', content, status: 'draft' });
  const blocked = await t.request('POST', '/cvs', { token: 'test:save', body: { id: d2.id } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'CV_LIMIT_REACHED');
});

test('kaydet: id zorunlu (422 CV_ID_REQUIRED), bilinmeyen alan 422, olmayan CV 404', async () => {
  const r = await t.request('POST', '/cvs', { token: 'test:saveval', body: { id: null, title: 'x' } });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'CV_ID_REQUIRED');
  assert.equal((await t.request('POST', '/cvs', { token: 'test:saveval', body: { title: 'x' } })).body.code, 'CV_ID_REQUIRED');
  assert.equal((await t.request('POST', '/cvs', { token: 'test:saveval', body: { id: 'a', admin: true } })).status, 422);
  assert.equal((await t.request('POST', '/cvs', { token: 'test:saveval', body: { id: 'yok' } })).status, 404);
});

test('taslak (CvDraft) sözleşmeye uyar; eksik alanlar [] / null', async () => {
  const { user } = await seed('draftcv');
  const full = await t.deps.cvs.create(user, { title: 'Tam', content: fx('cv_draft.json') });
  const r = await t.request('GET', `/cv-builder/draft?cv_id=${full.id}`, { token: 'test:draftcv' });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fx('cv_draft.json'));
  assert.equal(r.body.data.full_name, 'Emrah Doğan');

  const empty = await t.deps.cvs.create(user, { title: 'Boş', content: {}, template_id: 'classic' });
  const e = (await t.request('GET', `/cv-builder/draft?cv_id=${empty.id}`, { token: 'test:draftcv' })).body.data;
  assert.deepEqual(e.experiences, []);
  assert.deepEqual(e.skills, []);
  assert.equal(e.full_name, null);
  assert.equal(e.template_id, 'classic');
  assert.equal((await t.request('GET', '/cv-builder/draft', { token: 'test:draftcv' })).status, 422);
});

test('kimlik gerekli', async () => {
  /** @type {[string, string, any?][]} */
  const calls = [
    ['GET', '/cvs'],
    ['GET', '/cvs/detail?id=a'],
    ['POST', '/cvs/duplicate', { id: 'a' }],
    ['DELETE', '/cvs?id=a'],
    ['POST', '/cvs', { id: 'a' }],
    ['GET', '/cv-builder/draft?cv_id=a'],
  ];
  for (const [m, u, body] of calls) {
    assert.equal((await t.request(m, u, { body })).status, 401, `${m} ${u}`);
  }
});

test('sahiplik: başkasının CV\'sine erişilemez / silinemez / kopyalanamaz', async () => {
  const { user, row } = await seed('owner');
  const draft = await t.deps.cvs.create(user, { title: 'D', content, status: 'draft' });
  await t.request('GET', '/cvs', { token: 'test:intruder' });
  const tok = 'test:intruder';
  assert.equal((await t.request('GET', `/cvs/detail?id=${row.id}`, { token: tok })).status, 404);
  assert.equal((await t.request('GET', `/cv-builder/draft?cv_id=${row.id}`, { token: tok })).status, 404);
  assert.equal((await t.request('POST', '/cvs/duplicate', { token: tok, body: { id: row.id } })).status, 404);
  assert.equal((await t.request('POST', '/cvs', { token: tok, body: { id: draft.id } })).status, 404);
  assert.equal((await t.request('DELETE', `/cvs?id=${row.id}`, { token: tok })).status, 404);
  assert.deepEqual((await t.request('GET', '/cvs', { token: tok })).body.data.items, []);
  assert.equal((await t.request('GET', `/cvs/detail?id=${row.id}`, { token: 'test:owner' })).status, 200);
});

test('servis: updateContent / setScore / counts / contentToText', async () => {
  const { user, row } = await seed('svc', { is_tailored: true });
  await t.deps.cvs.updateContent(user, row.id, { ...content, full_name: 'Yeni Ad' }, { score: 90 });
  const got = await t.deps.cvs.getOwned(user, row.id);
  assert.equal(got.content.full_name, 'Yeni Ad');
  assert.equal(got.score, 90);
  await t.deps.cvs.setScore(row.id, 70);
  assert.equal((await t.deps.cvs.getOwned(user, row.id)).score, 70);
  assert.deepEqual(await t.deps.cvs.counts(user.id), { total: 1, tailored: 1 });
  assert.match(t.deps.cvs.contentToText(got.content), /Yeni Ad[\s\S]*Skills: Figma, Sketch/);
  await assert.rejects(() => t.deps.cvs.getOwned(user, row.id, { statuses: ['draft'] }), { code: 'CV_NOT_FOUND' });
});

test('iş: 7 günden eski taslaklar silinir, saved ve yeni taslak kalır', async () => {
  const { user, row } = await seed('purge');
  const old = await t.deps.cvs.create(user, { title: 'Eski', content, status: 'draft' });
  const fresh = await t.deps.cvs.create(user, { title: 'Yeni', content, status: 'draft' });
  await t.deps.db.run('UPDATE cvs SET created_at = UTC_TIMESTAMP(3) - INTERVAL 8 DAY WHERE id IN (?, ?)', [old.id, row.id]);
  assert.ok((await t.deps.cvs.purgeStaleDrafts()) >= 1);
  const left = (await t.deps.db.query('SELECT id FROM cvs WHERE user_id = ?', [user.id])).map((r) => r.id).sort();
  assert.deepEqual(left, [row.id, fresh.id].sort());
});

test('hesap silinince CV\'ler de silinir (cascade)', async () => {
  const { user } = await seed('gone');
  await t.request('DELETE', '/account', { token: 'test:gone' });
  await t.deps.account.purgeDue();
  assert.equal((await t.deps.db.query('SELECT id FROM cvs WHERE user_id = ?', [user.id])).length, 0);
});
