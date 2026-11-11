'use strict';

// CV görünümü (vurgu rengi / yazı tipi / aralık) ve dil + referans bölümleri: kayıt, taslak, önizleme.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
before(async () => {
  t = await setup();
});
after(() => t.close());

const body = {
  full_name: 'Alex Morgan',
  accent_color: '#DB2777',
  font: 'classic',
  spacing: 'relaxed',
  languages: [{ name: 'English', level: 'Native' }, { name: 'German', level: 'B2' }],
  references: [{ name: 'Jane Doe', position: 'CTO', company: 'Acme', email: 'jane@acme.test', phone: '+1 555' }],
};

test('görünüm, diller ve referanslar taslağa ve önizlemeye taşınır', async () => {
  const token = 'test:cust1';
  await t.request('PATCH', '/account', { token, body: { locale: 'en' } });
  const sub = await t.request('POST', '/cv-builder/submit', { token, body });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  const id = sub.body.data.id;

  const draft = (await t.request('GET', `/cv-builder/draft?cv_id=${id}`, { token })).body.data;
  assert.equal(draft.accent_color, '#DB2777');
  assert.equal(draft.font, 'classic');
  assert.equal(draft.spacing, 'relaxed');
  assert.deepEqual(draft.languages, body.languages);
  assert.deepEqual(draft.references, body.references);

  const detail = (await t.request('GET', `/cvs/detail?id=${id}`, { token })).body.data;
  assert.equal(detail.preview.accent_color, '#DB2777');
  assert.equal(detail.preview.font, 'classic');
  assert.equal(detail.preview.spacing, 'relaxed');
  const langs = detail.preview.sections.find((s) => s.heading === 'Languages');
  assert.deepEqual(langs.items, [{ title: 'English', meta: 'Native' }, { title: 'German', meta: 'B2' }]);
  const refs = detail.preview.sections.find((s) => s.heading === 'References');
  assert.deepEqual(refs.items, [{ title: 'Jane Doe', meta: 'CTO · Acme', body: 'jane@acme.test · +1 555' }]);
});

test('geçersiz görünüm değerleri reddedilir; boş bırakılırsa null', async () => {
  const token = 'test:cust2';
  const post = (b) => t.request('POST', '/cv-builder/submit', { token, body: { full_name: 'A', ...b } });
  assert.equal((await post({ accent_color: 'red' })).status, 422);
  assert.equal((await post({ font: 'comic' })).status, 422);
  assert.equal((await post({ spacing: 'huge' })).status, 422);
  assert.equal((await post({ languages: [{ name: 'X', fluency: 1 }] })).status, 422);
  const ok = await post({});
  const draft = (await t.request('GET', `/cv-builder/draft?cv_id=${ok.body.data.id}`, { token })).body.data;
  assert.equal(draft.accent_color, null);
  assert.deepEqual(draft.languages, []);
  assert.deepEqual(draft.references, []);
});
