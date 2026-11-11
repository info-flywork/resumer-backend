'use strict';

// ai modülü testi: OpenAI ve dış adresler sahte (deps.fetch / deps.dnsLookup) — gerçek ağ yok.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { setup } = require('./helpers');

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
/** @type {{ url: string, body: any }[]} */
const seen = [];
const state = {
  openai: 'ok',
  summary: 'Kısa özet.',
  description: 'Kısa profil bio.',
  pages: /** @type {Record<string, () => Response>} */ ({}),
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/** Sahte ağ: OpenAI + sayfa/görsel adresleri */
async function fakeFetch(input, init = {}) {
  const url = String(input);
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
  seen.push({ url, body });
  if (url.startsWith('https://api.openai.com/v1/chat/completions')) {
    if (state.openai === 'fail') return new Response('{}', { status: 500 });
    const schemaName = body?.response_format?.json_schema?.name;
    if (schemaName === 'experience_description') {
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ description: state.openai === 'empty' ? ' ' : 'Güçlü deneyim metni.' }) } }],
      });
    }
    if (schemaName === 'profile_description') {
      if (state.openai === 'empty') {
        return Response.json({ choices: [{ message: { content: JSON.stringify({ description: ' ' }) } }] });
      }
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ description: state.description }) } }],
      });
    }
    if (state.openai === 'empty') {
      return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: ' ' }) } }] });
    }
    return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: state.summary }) } }] });
  }
  if (url.startsWith('https://api.openai.com/v1/images/edits')) {
    if (state.openai === 'fail') return new Response('{}', { status: 400 });
    return Response.json({ data: [{ b64_json: PNG.toString('base64') }] });
  }
  const page = state.pages[url];
  if (page) return page();
  return new Response('yok', { status: 404 });
}

/** Sahte DNS: "internal.test" özel IP'ye çözülür, diğerleri genel */
const dnsLookup = async (host) => (host === 'internal.test' ? ['10.0.0.5'] : ['93.184.216.34']);

before(async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  t = await setup({ overrides: { fetch: fakeFetch, dnsLookup, aiRetryDelayMs: 0 } });
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
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')).data;
const balance = async (uid) => t.deps.credits.getBalance(await t.deps.users.findByFirebaseUid(uid));

test('özet sözleşmeye uyar; ton büyük/küçük harf duyarsız, dil ve anahtar kelimeler isteme girer', async () => {
  state.openai = 'ok';
  seen.length = 0;
  // Varsayılan dil artık en (231_users_locale_default_en): isteme kullanıcının dili girer
  await t.request('PATCH', '/account', { token: 'test:sum1', body: { locale: 'tr' } });
  const r = await t.request('POST', '/ai/summary', { token: 'test:sum1', body: { tone: 'Creative', keywords: ['Figma', 'UX'] } });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fixture('ai_summary.json'));
  assert.equal(r.body.data.summary, 'Kısa özet.');
  const sent = seen.find((s) => s.url.includes('chat/completions')).body;
  assert.equal(sent.model, 'gpt-4o-mini');
  assert.equal(sent.response_format.type, 'json_schema');
  assert.match(sent.messages[0].content, /Turkish/);
  assert.match(sent.messages[1].content, /Figma, UX/);
  assert.equal(await balance('sum1'), 3); // kredi düşmez
});

test('özet: kimlik gerekli; doğrulama 422', async () => {
  assert.equal((await t.request('POST', '/ai/summary', { body: { tone: 'dynamic', keywords: [] } })).status, 401);
  const post = (body) => t.request('POST', '/ai/summary', { token: 'test:sumv', body });
  assert.equal((await post({ keywords: [] })).status, 422);
  assert.equal((await post({ tone: 'angry', keywords: [] })).status, 422);
  assert.equal((await post({ tone: 'friendly', keywords: Array(16).fill('a') })).status, 422);
  assert.equal((await post({ tone: 'friendly', keywords: [''] })).status, 422);
  assert.equal((await post({ tone: 'friendly', keywords: ['x'.repeat(41)] })).status, 422);
  assert.equal((await post({ tone: 'friendly', keywords: [], admin: 1 })).status, 422);
  assert.equal((await post({ tone: 'friendly' })).status, 200);
});

test('özet: OpenAI hatası 502 AI_FAILED, uzun metin 600 karaktere kırpılır', async () => {
  state.openai = 'fail';
  const bad = await t.request('POST', '/ai/summary', { token: 'test:sumf', body: { tone: 'professional', keywords: [] } });
  assert.equal(bad.status, 502);
  assert.equal(bad.body.code, 'AI_FAILED');
  state.openai = 'empty';
  assert.equal((await t.request('POST', '/ai/summary', { token: 'test:sumf', body: { tone: 'professional', keywords: [] } })).status, 502);
  state.openai = 'ok';
  state.summary = 'a'.repeat(900);
  const r = await t.request('POST', '/ai/summary', { token: 'test:sumf', body: { tone: 'professional', keywords: [] } });
  assert.equal(r.body.data.summary.length, 600);
  state.summary = 'Kısa özet.';
});

test('profil açıklaması sözleşmeye uyar; alanlar isteme girer, kredi düşmez', async () => {
  state.openai = 'ok';
  state.description = 'Kısa profil bio.';
  seen.length = 0;
  const r = await t.request('POST', '/ai/description', {
    token: 'test:desc1',
    body: { name: 'Ada', title: 'Designer', location: 'Istanbul', description: 'eski metin' },
  });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fixture('ai_description.json'));
  assert.equal(r.body.data.description, 'Kısa profil bio.');
  const sent = seen.find((s) => s.url.includes('chat/completions')).body;
  assert.equal(sent.model, 'gpt-4o-mini');
  assert.match(sent.messages[1].content, /Ada/);
  assert.match(sent.messages[1].content, /Designer/);
  assert.match(sent.messages[1].content, /eski metin/);
  assert.equal(await balance('desc1'), 3);
});

test('profil açıklaması: kimlik gerekli; uzun metin 250 karaktere kırpılır; boş gövde kabul', async () => {
  assert.equal((await t.request('POST', '/ai/description', { body: {} })).status, 401);
  state.openai = 'ok';
  assert.equal((await t.request('POST', '/ai/description', { token: 'test:descv', body: {} })).status, 200);
  assert.equal(
    (await t.request('POST', '/ai/description', { token: 'test:descv', body: { name: 'x'.repeat(101) } })).status,
    422,
  );
  state.description = 'a'.repeat(400);
  const r = await t.request('POST', '/ai/description', { token: 'test:descv', body: { title: 'Dev' } });
  assert.equal(r.body.data.description.length, 250);
  state.description = 'Kısa profil bio.';
  state.openai = 'fail';
  assert.equal(
    (await t.request('POST', '/ai/description', { token: 'test:descv', body: { title: 'Dev' } })).body.code,
    'AI_FAILED',
  );
  state.openai = 'ok';
});

test('anahtar yoksa 503 AI_NOT_CONFIGURED', async () => {
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const r = await t.request('POST', '/ai/summary', { token: 'test:nokey', body: { tone: 'dynamic', keywords: [] } });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'AI_NOT_CONFIGURED');
    assert.equal((await t.request('POST', '/ai/portrait', { token: 'test:nokey', body: {} })).status, 503);
    assert.equal((await t.request('POST', '/ai/description', { token: 'test:nokey', body: {} })).status, 503);
  } finally {
    process.env.OPENAI_API_KEY = key;
  }
});

const photo = `data:image/png;base64,${PNG.toString('base64')}`;

test('portre sözleşmeye uyar, 1 kredi düşer, görsel herkese açık adresten sunulur', async () => {
  state.openai = 'ok';
  const r = await t.request('POST', '/ai/portrait', { token: 'test:por1', body: { photo } });
  assert.equal(r.status, 200);
  assertShape(r.body.data, fixture('ai_portrait.json'));
  assert.match(r.body.data.image, /^https:\/\/resumer\.fly-work\.com\/ai\/portraits\/[0-9a-f-]{36}\.png$/);
  assert.equal(await balance('por1'), 2);
  const img = await fetch(`${t.base}${new URL(r.body.data.image).pathname}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.match(img.headers.get('cache-control') ?? '', /immutable/);
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
  const edit = seen.filter((s) => s.url.includes('images/edits')).at(-1).body;
  assert.equal(edit.get('model'), 'gpt-image-1');
  assert.equal(edit.get('size'), '1024x1024');
});

test('portre: kimlik gerekli; fotoğraf yoksa 422 PHOTO_REQUIRED (kredi düşmez); bozuk girdi 422', async () => {
  assert.equal((await t.request('POST', '/ai/portrait', { body: {} })).status, 401);
  const none = await t.request('POST', '/ai/portrait', { token: 'test:por2' });
  assert.equal(none.status, 422);
  assert.equal(none.body.code, 'PHOTO_REQUIRED');
  assert.equal(await balance('por2'), 3);
  const post = (body) => t.request('POST', '/ai/portrait', { token: 'test:por2', body });
  assert.equal((await post({ photo: 'merhaba' })).status, 422);
  assert.equal((await post({ photo: `data:image/gif;base64,${PNG.toString('base64')}` })).status, 422);
  const big = `data:image/png;base64,${Buffer.alloc(701 * 1024).toString('base64')}`;
  assert.equal((await post({ photo: big })).status, 422);
  assert.equal((await post({ photo_url: 'ftp-degil' })).status, 422);
  assert.equal((await post({ extra: 1 })).status, 422);
});

test('portre: photo_url ve users.photo_url kaynağı; özel adres reddedilir', async () => {
  state.pages['https://cdn.test/me.png'] = () => new Response(PNG, { headers: { 'content-type': 'image/png' } });
  const viaUrl = await t.request('POST', '/ai/portrait', { token: 'test:por3', body: { photo_url: 'https://cdn.test/me.png' } });
  assert.equal(viaUrl.status, 200);

  const blocked = await t.request('POST', '/ai/portrait', { token: 'test:por3', body: { photo_url: 'http://internal.test/me.png' } });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.code, 'URL_UNREADABLE');
  assert.equal((await t.request('POST', '/ai/portrait', { token: 'test:por3', body: { photo_url: 'http://127.0.0.1/x.png' } })).status, 422);
  assert.equal(await balance('por3'), 2);

  const user = await t.deps.users.findByFirebaseUid('por3');
  await t.deps.db.run('UPDATE users SET photo_url = ? WHERE id = ?', ['https://cdn.test/me.png', user.id]);
  assert.equal((await t.request('POST', '/ai/portrait', { token: 'test:por3' })).status, 200);
  assert.equal(await balance('por3'), 1);
});

test('portre: gövde yoksa profilde yüklenen avatar, giriş fotoğrafından önce kullanılır', async () => {
  state.openai = 'ok';
  state.pages['https://cdn.test/avatar.png'] = () => new Response(PNG, { headers: { 'content-type': 'image/png' } });
  await t.request('PATCH', '/me', { token: 'test:por6', body: { avatar_url: 'https://cdn.test/avatar.png' } });
  const user = await t.deps.users.findByFirebaseUid('por6');
  await t.deps.db.run('UPDATE users SET photo_url = ? WHERE id = ?', ['https://cdn.test/yok.png', user.id]);
  seen.length = 0;
  assert.equal((await t.request('POST', '/ai/portrait', { token: 'test:por6' })).status, 200);
  assert.ok(seen.some((x) => x.url === 'https://cdn.test/avatar.png'));
  assert.ok(!seen.some((x) => x.url === 'https://cdn.test/yok.png'));
});

test('portre: kredi yetmezse 403; OpenAI hatasında kredi iade edilir + 502', async () => {
  state.openai = 'ok';
  for (let i = 0; i < 3; i += 1) assert.equal((await t.request('POST', '/ai/portrait', { token: 'test:por4', body: { photo } })).status, 200);
  const out = await t.request('POST', '/ai/portrait', { token: 'test:por4', body: { photo } });
  assert.equal(out.status, 403);
  assert.equal(out.body.code, 'INSUFFICIENT_CREDITS');

  state.openai = 'fail';
  assert.equal((await t.request('POST', '/ai/portrait', { token: 'test:por5', body: { photo } })).body.code, 'AI_FAILED');
  assert.equal(await balance('por5'), 3);
  state.openai = 'ok';
});

test('portre görseli: bilinmeyen id 404, bozuk id 422; hesap silinince portreler silinir (cascade)', async () => {
  assert.equal((await t.request('GET', '/ai/portraits/00000000-0000-4000-8000-000000000000.png')).status, 404);
  assert.equal((await t.request('GET', '/ai/portraits/yok.png')).status, 422);
  await t.request('POST', '/ai/portrait', { token: 'test:gone', body: { photo } });
  const user = await t.deps.users.findByFirebaseUid('gone');
  assert.equal((await t.deps.db.query('SELECT id FROM ai_portraits WHERE user_id = ?', [user.id])).length, 1);
  await t.request('DELETE', '/account', { token: 'test:gone' });
  await t.deps.account.purgeDue();
  assert.equal((await t.deps.db.query('SELECT id FROM ai_portraits WHERE user_id = ?', [user.id])).length, 0);
});

test('fetchPageText: script/style atılır; yönlendirme her adımda denetlenir; boyut sınırı', async () => {
  state.pages['https://site.test/cv'] = () =>
    new Response('<html><head><style>p{}</style><script>alert(1)</script></head><body><h1>Merhaba</h1><p>Dünya &amp; ben</p></body></html>', {
      headers: { 'content-type': 'text/html' },
    });
  assert.equal(await t.deps.ai.fetchPageText('https://site.test/cv'), 'Merhaba Dünya & ben');

  state.pages['https://site.test/go'] = () => new Response(null, { status: 302, headers: { location: 'https://site.test/cv' } });
  assert.equal(await t.deps.ai.fetchPageText('https://site.test/go'), 'Merhaba Dünya & ben');
  state.pages['https://site.test/evil'] = () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
  await assert.rejects(t.deps.ai.fetchPageText('https://site.test/evil'), { code: 'URL_UNREADABLE' });
  state.pages['https://site.test/loop'] = () => new Response(null, { status: 302, headers: { location: 'https://site.test/loop' } });
  await assert.rejects(t.deps.ai.fetchPageText('https://site.test/loop'), { code: 'URL_UNREADABLE' });

  state.pages['https://site.test/big'] = () => new Response(Buffer.alloc(2 * 1024 * 1024 + 1, 97), { headers: { 'content-type': 'text/plain' } });
  await assert.rejects(t.deps.ai.fetchPageText('https://site.test/big'), { code: 'URL_UNREADABLE' });
  await assert.rejects(t.deps.ai.fetchPageText('file:///etc/passwd'), { code: 'URL_UNREADABLE' });
  await assert.rejects(t.deps.ai.fetchPageText('http://[::1]/'), { code: 'URL_UNREADABLE' });

  state.pages['https://site.test/long'] = () => new Response('b'.repeat(30000), { headers: { 'content-type': 'text/plain' } });
  assert.equal((await t.deps.ai.fetchPageText('https://site.test/long')).length, 20000);
});

test('deneyim: açıklama iyileştirilir; bilgiler isteme girer; kimlik / doğrulama', async () => {
  state.openai = 'ok';
  seen.length = 0;
  assert.equal((await t.request('POST', '/ai/experience', { body: { position: 'Designer' } })).status, 401);
  const post = (body) => t.request('POST', '/ai/experience', { token: 'test:exp1', body });
  assert.equal((await post({})).status, 422);
  assert.equal((await post({ position: 'Designer', admin: 1 })).status, 422);
  const r = await post({ position: 'Product Designer', company: 'Acme', description: 'ekranlar tasarladım' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.description, 'Güçlü deneyim metni.');
  const sent = seen.find((x) => x.url.includes('chat/completions')).body;
  assert.match(sent.messages[1].content, /Product Designer[\s\S]*Acme[\s\S]*ekranlar tasarladım/);
  state.openai = 'empty';
  assert.equal((await post({ position: 'Designer' })).status, 502);
  state.openai = 'ok';
});
