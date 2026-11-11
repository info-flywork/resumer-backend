'use strict';

// content modülü testi: sözleşme (mock alanları), kimlik, dil seçimi, servis.
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

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')).data;

test('GET /templates sözleşmeye uyar, sıralı gelir, premium işaretlidir', async () => {
  const r = await t.request('GET', '/templates', { token: 'test:tpl' });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fixture('templates.json'));
  const ids = r.body.data.items.map((i) => i.id);
  assert.equal(ids.length, 53);
  assert.deepEqual(ids, [
    'horizon', 'atelier', 'prime',
    'onyx', 'verdant', 'lumen', 'cobalt', 'ember', 'nova',
    'sable', 'linea', 'tabula', 'apex', 'crimson', 'midnight', 'vertex', 'amber', 'azure',
    'harbor', 'petal', 'graphite', 'dune', 'monarch', 'pixel', 'stripe', 'glacier',
    'orbit', 'kraft', 'metro', 'ivory', 'bloom', 'compass', 'noir',
    'modern', 'aurora', 'nexus', 'slate', 'mono', 'pulse',
    'classic', 'elegant', 'atlas', 'meridian', 'folio',
    'executive', 'summit', 'ledger', 'boardroom', 'capital',
    'creative', 'vivid', 'studio', 'prism',
  ]);
  assert.equal(r.body.data.items.find((i) => i.id === 'executive').is_premium, true);
  assert.equal(r.body.data.items.find((i) => i.id === 'horizon').is_premium, true);
  assert.equal(r.body.data.items.find((i) => i.id === 'prime').is_premium, false);
  assert.equal(r.body.data.items[0].image, 'assets/images/img_template_horizon.png');
  assert.equal(
    r.body.data.items.find((i) => i.id === 'classic').image,
    'assets/images/img_template_classic.png',
  );
});

test('GET /templates kimlik ister', async () => {
  assert.equal((await t.request('GET', '/templates')).status, 401);
});

test('pasif şablon listede görünmez', async () => {
  await t.deps.db.run("UPDATE cv_templates SET is_active = 0 WHERE id = 'classic'");
  const r = await t.request('GET', '/templates', { token: 'test:tpl2' });
  assert.equal(r.body.data.items.length, 52);
  assert.ok(!r.body.data.items.some((i) => i.id === 'classic'));
  await t.deps.db.run("UPDATE cv_templates SET is_active = 1 WHERE id = 'classic'");
});

test('GET /faq kimliksiz açık, sözleşmeye uyar, lorem içermez', async () => {
  const r = await t.request('GET', '/faq');
  assert.equal(r.status, 200);
  assertShape(r.body.data, fixture('faq.json'));
  assert.equal(r.body.data.items.length, 3);
  assert.ok(!JSON.stringify(r.body.data).toLowerCase().includes('lorem'));
});

test('GET /faq dil: Accept-Language, kullanıcı dili, yoksa en', async () => {
  // 230_faqs_locales her dil için SSS ekler; testin eklediği tr kaydı da listede olmalı
  await t.deps.db.run("INSERT INTO faqs (id, locale, question, answer, sort_order) VALUES ('faq_tr_1', 'tr', 'Soru?', 'Cevap.', 1)");
  const trIds = (await t.deps.db.query("SELECT id FROM faqs WHERE locale = 'tr' ORDER BY sort_order, id")).map((r) => r.id);
  const tr = await t.request('GET', '/faq', { headers: { 'Accept-Language': 'tr-TR,tr;q=0.9' } });
  assert.deepEqual(tr.body.data.items.map((i) => i.id).sort(), [...trIds].sort());
  assert.ok(trIds.includes('faq_tr_1'));
  const de = await t.request('GET', '/faq', { headers: { 'Accept-Language': 'de' } });
  assert.equal(de.body.data.items.length, 3);

  // Giriş yapmış kullanıcıda Accept-Language değil user.locale geçerli
  await t.request('GET', '/templates', { token: 'test:loc' }); // kullanıcıyı oluşturur
  const user = await t.deps.users.findByFirebaseUid('loc');
  await t.deps.db.run("UPDATE users SET locale = 'tr' WHERE id = ?", [user.id]);
  const r = await t.request('GET', '/faq', { token: 'test:loc', headers: { 'Accept-Language': 'en' } });
  assert.deepEqual(r.body.data.items.map((i) => i.id).sort(), [...trIds].sort());
});

test('deps.content.getTemplate: var olan / premium / yok', async () => {
  assert.deepEqual(await t.deps.content.getTemplate('executive'), { id: 'executive', is_premium: true });
  assert.deepEqual(await t.deps.content.getTemplate('modern'), { id: 'modern', is_premium: false });
  assert.equal(await t.deps.content.getTemplate('yok'), null);
});
