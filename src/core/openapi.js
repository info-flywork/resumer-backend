'use strict';

const { z } = require('zod');
const { toOpenApiPath } = require('./route');

/**
 * Modül tanımlarından OpenAPI 3.1 belgesi. Flutter tarafındaki repository'ler ve sözleşme testleri
 * bu belgeyi okur; elle yazılmaz.
 * @param {import('./route').Module[]} modules
 * @param {{ title: string, version: string, serverUrl?: string }} info
 */
function buildOpenApi(modules, info) {
  /** @param {z.ZodType} s */
  const json = (s) => z.toJSONSchema(s, { target: 'openapi-3.0', unrepresentable: 'any', io: 'output' });
  /** @param {z.ZodType} s */
  const input = (s) => z.toJSONSchema(s, { target: 'openapi-3.0', unrepresentable: 'any', io: 'input' });
  const envelope = (data) => ({
    type: 'object',
    required: ['status', 'message', 'data'],
    properties: { status: { type: 'string', enum: ['success'] }, message: { type: 'string' }, data },
  });
  const errorEnvelope = {
    type: 'object',
    required: ['status', 'message', 'code'],
    properties: {
      status: { type: 'string', enum: ['error'] },
      message: { type: 'string' },
      code: { type: 'string' },
      data: { nullable: true },
      errors: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } },
    },
  };

  /** @type {Record<string, any>} */
  const paths = {};
  for (const mod of modules) {
    for (const r of mod.routes) {
      const p = toOpenApiPath(`${mod.prefix}${r.path}`) || '/';
      /** @type {any} */
      const op = {
        tags: r.tags ?? [mod.name],
        summary: r.summary,
        operationId: `${r.method}_${p.replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
        ...(r.auth !== 'none' ? { security: [{ firebase: [] }] } : {}),
        ...(r.premium ? { 'x-premium': r.premium } : {}),
        parameters: [],
        responses: {
          [String(r.status ?? 200)]: {
            description: 'Başarılı',
            content: { 'application/json': { schema: envelope(r.response ? json(r.response) : { nullable: true }) } },
          },
          default: { description: 'Hata', content: { 'application/json': { schema: errorEnvelope } } },
        },
      };
      for (const part of /** @type {const} */ (['params', 'query'])) {
        const s = r.request?.[part];
        if (!s) continue;
        const js = /** @type {any} */ (input(s));
        for (const [name, schema] of Object.entries(js.properties || {})) {
          op.parameters.push({
            name,
            in: part === 'params' ? 'path' : 'query',
            required: part === 'params' || (js.required || []).includes(name),
            schema,
          });
        }
      }
      if (r.request?.body) {
        op.requestBody = { required: true, content: { 'application/json': { schema: input(r.request.body) } } };
      }
      (paths[p] ??= {})[r.method] = op;
    }
  }
  return {
    openapi: '3.1.0',
    info: { title: info.title, version: info.version },
    ...(info.serverUrl ? { servers: [{ url: info.serverUrl }] } : {}),
    components: { securitySchemes: { firebase: { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID token' } } },
    paths,
  };
}

module.exports = { buildOpenApi };
