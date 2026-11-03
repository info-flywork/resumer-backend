'use strict';

// AI portreleri CDN'de (Bunny sahte — gerçek ağ yok): yeni portre CDN'e, eski adres yönlendirir, taşıma adımları,
// hesap silinince CDN dosyaları silinir.
const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const { setup } = require('./helpers');
const { createAiRepository } = require('../src/modules/ai/repository');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const photo = `data:image/png;base64,${PNG.toString('base64')}`;
const CDN = 'https://cdn.test/resumer';

/** Sahte Bunny depolama */
const files = new Map();
const cdn = { failPut: false };
const storage = {
  driver: 'bunny',
  prefix: 'resumer',
  url: (/** @type {string} */ key) => `${CDN}/${key}`,
  async put(/** @type {string} */ key, /** @type {Buffer} */ body) {
    if (cdn.failPut) throw new Error('CDN yükleme hatası (HTTP 500)');
    files.set(key, body);
    return `${CDN}/${key}`;
  },
  async remove(/** @type {string} */ key) {
    files.delete(key);
  },
};

async function fakeFetch(input) {
  const url = String(input);
  if (url.startsWith('https://api.openai.com/v1/images/edits')) return Response.json({ data: [{ b64_json: PNG.toString('base64') }] });
  return new Response('yok', { status: 404 });
}

before(async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  t = await setup({ overrides: { fetch: fakeFetch, aiRetryDelayMs: 0, storage } });
});
after(async () => {
  delete process.env.OPENAI_API_KEY;
  await t.close();
});
beforeEach(() => {
  cdn.failPut = false;
});

const row = (id) => t.deps.db.one('SELECT image, storage_key FROM ai_portraits WHERE id = ?', [id]);
const idOf = (url) => /([0-9a-f-]{36})\.png$/.exec(url)?.[1] ?? '';

test('yeni portre CDN adresiyle döner; veritabanında görsel tutulmaz', async () => {
  const r = await t.request('POST', '/ai/portrait', { token: 'test:cdn1', body: { photo } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.data.image, /^https:\/\/cdn\.test\/resumer\/portraits\/[0-9a-f-]{36}\.png$/);
  const id = idOf(r.body.data.image);
  assert.deepEqual(files.get(`portraits/${id}.png`), PNG);
  const saved = await row(id);
  assert.equal(saved.image, null);
  assert.equal(saved.storage_key, `portraits/${id}.png`);
});

test('CDN yüklemesi olmazsa portre kaybolmaz: veritabanına yazılır, eski adresten sunulur', async () => {
  cdn.failPut = true;
  const r = await t.request('POST', '/ai/portrait', { token: 'test:cdn2', body: { photo } });
  assert.equal(r.status, 200);
  assert.match(r.body.data.image, /\/ai\/portraits\/[0-9a-f-]{36}\.png$/);
  const img = await fetch(`${t.base}${new URL(r.body.data.image).pathname}`);
  assert.equal(img.status, 200);
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
});

test('CV\'lerdeki eski adres CDN\'e kalıcı yönlendirir (301)', async () => {
  const r = await t.request('POST', '/ai/portrait', { token: 'test:cdn3', body: { photo } });
  const id = idOf(r.body.data.image);
  const res = await fetch(`${t.base}/ai/portraits/${id}.png`, { redirect: 'manual' });
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), `${CDN}/portraits/${id}.png`);
  assert.match(res.headers.get('cache-control') ?? '', /immutable/);
});

test('taşıma: veritabanındaki portre bulunur, işaretlenir, kopyası yalnızca CDN\'deyken silinir', async () => {
  const repo = createAiRepository(t.deps.db);
  cdn.failPut = true;
  const r = await t.request('POST', '/ai/portrait', { token: 'test:cdn4', body: { photo } });
  const id = idOf(r.body.data.image);
  const pending = await repo.pendingForCdn('', 100);
  assert.ok(pending.some((p) => p.id === id));
  // işaretlenmeden kopya silinmez
  await repo.dropImage(id);
  assert.notEqual((await row(id)).image, null);
  await repo.setStorageKey(id, `portraits/${id}.png`);
  assert.ok((await repo.uploadedWithBlob('', 100)).some((p) => p.id === id && Number(p.size) === PNG.length));
  await repo.dropImage(id);
  assert.equal((await row(id)).image, null);
  const stats = await repo.cdnStats();
  assert.ok(Number(stats.cdn_only) >= 1);
});

test('hesap silinince kullanıcının CDN\'deki portreleri silinir', async () => {
  const r = await t.request('POST', '/ai/portrait', { token: 'test:cdn-gone', body: { photo } });
  const key = `portraits/${idOf(r.body.data.image)}.png`;
  assert.ok(files.has(key));
  await t.request('DELETE', '/account', { token: 'test:cdn-gone' });
  await t.deps.account.purgeDue();
  assert.equal(files.has(key), false);
});
