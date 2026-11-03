'use strict';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { z } = require('zod');
const { setup } = require('./helpers');
const { defineModule } = require('../src/core/route');
const { modules } = require('../src/modules');
const { buildOpenApi } = require('../src/core/openapi');
const { redact } = require('../src/core/logger');

const probe = defineModule('probe', '/probe', [
  {
    method: 'post',
    path: '/echo/:id',
    summary: 'test',
    auth: 'none',
    request: { params: z.object({ id: z.coerce.number().int() }), body: z.object({ name: z.string().min(2) }) },
    response: z.object({ id: z.number(), name: z.string() }),
    async handler({ params, body }) {
      return { id: params.id, name: body.name };
    },
  },
  {
    method: 'get',
    path: '/broken',
    summary: 'sözleşmeye uymayan yanıt',
    auth: 'none',
    response: z.object({ count: z.number() }),
    async handler() {
      return { count: 'çok' };
    },
  },
  {
    method: 'get',
    path: '/premium',
    summary: 'premium',
    auth: 'required',
    premium: true,
    response: z.object({ ok: z.boolean() }),
    async handler() {
      return { ok: true };
    },
  },
]);

/** @type {Awaited<ReturnType<typeof setup>>} */
let t;
before(async () => {
  t = await setup({ modules: [...modules, probe] });
});
after(() => t.close());

test('başarılı yanıt Flutter zarfında: {status, message, data}', async () => {
  const r = await t.request('POST', '/probe/echo/7', { body: { name: 'Ayşe' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: 'success', message: 'ok', data: { id: 7, name: 'Ayşe' } });
});

test('doğrulama hatası 422 + alan listesi', async () => {
  const r = await t.request('POST', '/probe/echo/x', { body: { name: 'A' } });
  assert.equal(r.status, 422);
  assert.equal(r.body.status, 'error');
  assert.equal(r.body.code, 'VALIDATION_ERROR');
  assert.deepEqual(r.body.errors.map((e) => e.field).sort(), ['id', 'name']);
});

test('sözleşmeye uymayan yanıt test / geliştirmede 500 (yakalanır)', async () => {
  const r = await t.request('GET', '/probe/broken');
  assert.equal(r.status, 500);
  assert.equal(r.body.code, 'RESPONSE_CONTRACT');
});

test('kimlik: token yok 401, geçersiz 401, Firebase erişilemiyor 503 (oturum kapatılmaz)', async () => {
  assert.equal((await t.request('GET', '/account')).status, 401);
  const expired = await t.request('GET', '/account', { token: 'expired' });
  assert.equal(expired.status, 401);
  assert.equal(expired.body.code, 'INVALID_TOKEN');
  const down = await t.request('GET', '/account', { token: 'down' });
  assert.equal(down.status, 503);
  assert.equal(down.body.code, 'AUTH_UNAVAILABLE');
});

test('premium kilidi: entitlement yoksa 403, varsa 200', async () => {
  const token = 'test:prem-1';
  const denied = await t.request('GET', '/probe/premium', { token });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'PREMIUM_REQUIRED');
  const user = await t.deps.users.findByFirebaseUid('prem-1');
  await t.deps.db.run("INSERT INTO entitlements (user_id, entitlement, expires_at) VALUES (?, 'premium', UTC_TIMESTAMP(3) + INTERVAL 1 DAY)", [user.id]);
  assert.equal((await t.request('GET', '/probe/premium', { token })).status, 200);
});

test('bilinmeyen yol ve bozuk JSON da aynı hata zarfında', async () => {
  const nf = await t.request('GET', '/yok');
  assert.equal(nf.status, 404);
  assert.equal(nf.body.status, 'error');
  const res = await fetch(`${t.base}/probe/echo/1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bozuk' });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.code, 'BAD_BODY');
});

test('health: veritabanı ayakta', async () => {
  const r = await t.request('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.ok, true);
});

test('OpenAPI: tüm uçlar, Firebase güvenliği, yanıt zarfı', () => {
  const spec = buildOpenApi(modules, { title: 'x', version: '1' });
  assert.ok(spec.paths['/account'].get.security);
  assert.ok(!spec.paths['/health'].get.security);
  const schema = spec.paths['/account'].get.responses['200'].content['application/json'].schema;
  assert.deepEqual(schema.required, ['status', 'message', 'data']);
});

test('modül kuralları: yollar çakışmaz, data her zaman nesne (Flutter BaseResponse Map bekler)', () => {
  const seen = new Set();
  for (const m of modules) {
    for (const r of m.routes) {
      const key = `${r.method} ${m.prefix}${r.path}`;
      assert.ok(!seen.has(key), `çakışan yol: ${key}`);
      seen.add(key);
      if (r.response) assert.equal(r.response.def.type, 'object', `${key}: yanıt nesne olmalı (liste ise { items: [...] })`);
      assert.ok(['none', 'optional', 'required'].includes(r.auth), `${key}: auth`);
    }
  }
});

test('log maskeleme: kişisel veri ve sırlar yazılmaz', () => {
  const out = /** @type {any} */ (redact({ email: 'a@b.co', full_name: 'Ayşe', token: 'x', nested: { phone: '+90' }, ok: 1 }));
  assert.equal(out.email, '[kişisel]');
  assert.equal(out.full_name, '[kişisel]');
  assert.equal(out.token, '[gizli]');
  assert.equal(out.nested.phone, '[kişisel]');
  assert.equal(out.ok, 1);
});
