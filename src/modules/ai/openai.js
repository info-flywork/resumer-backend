'use strict';

const { AppError } = require('../../core/errors');

const CHAT_MODEL = 'gpt-4o-mini';
const IMAGE_MODEL = 'gpt-image-1';
const TIMEOUT_MS = 60_000;

const failed = () => new AppError(502, 'AI_FAILED', 'Yapay zekâ şu an yanıt veremedi');
const wait = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/**
 * OpenAI istemcisi (fetch üzerinden). `doFetch` testte sahtelenir.
 * @param {{ apiKey: () => string, doFetch: () => typeof fetch, retryDelayMs?: number }} o
 */
function createOpenAiClient({ apiKey, doFetch, retryDelayMs = 500 }) {
  /** 429/5xx ve ağ hatasında bir kez daha dener @param {string} url @param {() => RequestInit} init */
  async function call(url, init) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await doFetch()(url, { ...init(), signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.ok) return /** @type {any} */ (await res.json());
        if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
          await wait(retryDelayMs);
          continue;
        }
        throw failed();
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (attempt === 0) {
          await wait(retryDelayMs);
          continue;
        }
        throw failed();
      }
    }
    throw failed();
  }

  return {
    /**
     * Yapılandırılmış (json_schema strict) sohbet yanıtı → ayrıştırılmış nesne
     * @param {{ system: string, user: string, schema: object, schemaName: string, maxTokens?: number }} o
     * @returns {Promise<any>}
     */
    async json({ system, user, schema, schemaName, maxTokens = 800 }) {
      const out = await call('https://api.openai.com/v1/chat/completions', () => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
        body: JSON.stringify({
          model: CHAT_MODEL,
          temperature: 0.4,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
        }),
      }));
      try {
        return JSON.parse(out.choices[0].message.content);
      } catch {
        throw failed();
      }
    },

    /**
     * gpt-image-1 images/edits → PNG
     * @param {{ image: Buffer, mime: string, prompt: string }} o
     * @returns {Promise<Buffer>}
     */
    async editImage({ image, mime, prompt }) {
      const out = await call('https://api.openai.com/v1/images/edits', () => {
        const form = new FormData();
        form.set('model', IMAGE_MODEL);
        form.set('prompt', prompt);
        form.set('size', '1024x1024');
        form.set('image', new Blob([new Uint8Array(image)], { type: mime }), `photo.${mime.split('/')[1] || 'png'}`);
        return { method: 'POST', headers: { Authorization: `Bearer ${apiKey()}` }, body: form };
      });
      const b64 = out?.data?.[0]?.b64_json;
      if (typeof b64 !== 'string' || !b64) throw failed();
      return Buffer.from(b64, 'base64');
    },
  };
}

module.exports = { createOpenAiClient };
