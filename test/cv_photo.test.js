'use strict';

// POST /cv-builder/photo: sihirbazdaki CV fotoğrafı kalıcı adrese taşınır (CDN varsa CDN, yoksa veritabanı).
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const photo = `data:image/jpeg;base64,${JPEG.toString('base64')}`;

const CDN = 'https://cdn.test/resumer';
const files = new Map();
const cdn = { on: false };
/** CDN açıkken Bunny gibi davranır, kapalıyken veritabanı yolu sınanır */
const storage = {
  get driver() {
    return cdn.on ? 'bunny' : 'local';
  },
  prefix: 'resumer',
  url: (/** @type {string} */ key) => `${CDN}/${key}`,
  async put(/** @type {string} */ key, /** @type {Buffer} */ body) {
    files.set(key, body);
    return `${CDN}/${key}`;
  },
  async remove(/** @type {string} */ key) {
    files.delete(key);
  },
};

before(async () => {
  t = await setup({ overrides: { storage } });
});
after(() => t.close());

test('oturumsuz istek 401', async () => {
  const r = await t.request('POST', '/cv-builder/photo', { body: { photo } });
  assert.equal(r.status, 401);
});

test('geçersiz fotoğraf reddedilir', async () => {
  const bad = await t.request('POST', '/cv-builder/photo', { token: 'test:p1', body: { photo: 'file:///tmp/a.jpg' } });
  assert.ok(bad.status >= 400 && bad.status < 500, String(bad.status));
  const empty = await t.request('POST', '/cv-builder/photo', { token: 'test:p1', body: {} });
  assert.ok(empty.status >= 400 && empty.status < 500, String(empty.status));
});

test('CDN yokken veritabanına yazılır ve herkese açık adresten aynı baytlar sunulur', async () => {
  cdn.on = false;
  const r = await t.request('POST', '/cv-builder/photo', { token: 'test:p2', body: { photo } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.data.url, /\/ai\/portraits\/[0-9a-f-]{36}\.png$/);
  const img = await fetch(`${t.base}${new URL(r.body.data.url).pathname}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), JPEG);
});

test('CDN varken fotoğraf cv_photos/ altına yüklenir, veritabanında görsel tutulmaz', async () => {
  cdn.on = true;
  const r = await t.request('POST', '/cv-builder/photo', { token: 'test:p3', body: { photo } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const m = /^https:\/\/cdn\.test\/resumer\/cv_photos\/([0-9a-f-]{36})\.jpg$/.exec(r.body.data.url);
  assert.ok(m, r.body.data.url);
  assert.deepEqual(files.get(`cv_photos/${m[1]}.jpg`), JPEG);
  const row = await t.deps.db.one('SELECT image, storage_key FROM ai_portraits WHERE id = ?', [m[1]]);
  assert.equal(row.image, null);
  assert.equal(row.storage_key, `cv_photos/${m[1]}.jpg`);
});

test('yüklenen adres CV taslağıyla kaydedilir', async () => {
  cdn.on = true;
  const up = await t.request('POST', '/cv-builder/photo', { token: 'test:p4', body: { photo } });
  const sub = await t.request('POST', '/cv-builder/submit', {
    token: 'test:p4',
    body: { full_name: 'Alex Morgan', photo: up.body.data.url },
  });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));
  const draft = await t.request('GET', `/cv-builder/draft?cv_id=${sub.body.data.id}`, { token: 'test:p4' });
  assert.equal(draft.body.data.photo, up.body.data.url);
});
