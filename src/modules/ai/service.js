'use strict';

const { randomUUID } = require('node:crypto');
const { extra } = require('../../config/env');
const { AppError, unavailable, notFound } = require('../../core/errors');
const { COSTS } = require('../credits/service');
const { DATA_URL } = require('./schemas');
const { createAiRepository } = require('./repository');
const { createOpenAiClient } = require('./openai');
const { createFetcher, systemLookup } = require('./fetcher');

const DEFAULT_API_URL = 'https://resumer.fly-work.com';
const PORTRAIT_PROMPT =
  "professional corporate headshot, neutral studio background, business attire, keep the person's identity and facial features";
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false,
};
const DESCRIPTION_SCHEMA = {
  type: 'object',
  properties: { description: { type: 'string' } },
  required: ['description'],
  additionalProperties: false,
};
const EXPERIENCE_SCHEMA = {
  type: 'object',
  properties: { description: { type: 'string' } },
  required: ['description'],
  additionalProperties: false,
};
const TONES = {
  professional: 'professional and polished',
  dynamic: 'energetic and action-oriented',
  creative: 'creative and distinctive',
  friendly: 'warm and approachable',
};

const PHOTO_EXT = /** @type {Record<string, string>} */ ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });
/** CV fotoğrafının CDN yolu @param {string} id @param {string} mime */
const cvPhotoKey = (id, mime) => `cv_photos/${id}.${PHOTO_EXT[mime] ?? 'jpg'}`;

/** CDN yolu (uygulama klasörünün içinde) @param {string} id */
const portraitKey = (id) => `portraits/${id}.png`;

/** Kullanıcının dilinin İngilizce adı (istem için) @param {string | undefined} locale */
function languageName(locale) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of((locale || 'en').replace('_', '-')) || 'English';
  } catch {
    return 'English';
  }
}

/**
 * `deps.ai`: OpenAI istemcisi + güvenli URL okuma (diğer modüller de kullanır) ve portre / özet uçları.
 * Testte ağ `deps.fetch` (ve DNS `deps.dnsLookup`) ile sahtelenir; her çağrıda okunur.
 * @param {import('../../container').Container} deps
 */
function createService(deps) {
  const repo = createAiRepository(deps.db);
  const doFetch = () => /** @type {typeof fetch} */ (deps.fetch ?? globalThis.fetch);
  const apiKey = () => extra('OPENAI_API_KEY');
  const openai = createOpenAiClient({
    apiKey,
    doFetch,
    retryDelayMs: Number(deps.aiRetryDelayMs ?? 500),
    log: (msg, meta) => deps.logger.error(msg, meta),
  });
  const fetcher = createFetcher({ doFetch, lookup: () => deps.dnsLookup ?? systemLookup() });

  const ai = {
    get enabled() {
      return Boolean(apiKey());
    },
    assertEnabled() {
      if (!apiKey()) throw unavailable('Yapay zekâ servisi yapılandırılmamış', 'AI_NOT_CONFIGURED');
    },
    json: openai.json,
    editImage: openai.editImage,
    fetchPageText: fetcher.fetchPageText,
    fetchImage: fetcher.fetchImage,

    /**
     * POST /ai/portrait — kaynak sırası: body.photo → body.photo_url → users.photo_url
     * @param {{ id: string }} user @param {{ photo?: string, photo_url?: string }} body
     */
    async portrait(user, body) {
      ai.assertEnabled();
      /** @type {{ buffer: Buffer, mime: string } | null} */
      let source = null;
      const m = body.photo ? DATA_URL.exec(body.photo) : null;
      if (body.photo && m) {
        source = { buffer: Buffer.from(m[1], 'base64'), mime: body.photo.slice(5, body.photo.indexOf(';')) };
      } else {
        const url = body.photo_url ?? (await repo.userPhotoUrl(user.id));
        if (url) source = await ai.fetchImage(url);
      }
      if (!source) throw new AppError(422, 'PHOTO_REQUIRED', 'Fotoğraf gerekli');

      const id = randomUUID();
      await deps.credits.consume(user, COSTS.portrait, 'portrait', id);
      let png;
      try {
        png = await ai.editImage({ image: source.buffer, mime: source.mime, prompt: PORTRAIT_PROMPT });
      } catch (err) {
        await deps.credits.refund(user, COSTS.portrait, id);
        throw err;
      }
      // CDN (Bunny) varsa görsel oraya; yükleme olmazsa kullanıcı kaybetmesin — eskisi gibi veritabanına
      if (deps.storage.driver === 'bunny') {
        const key = portraitKey(id);
        try {
          const url = await deps.storage.put(key, png, 'image/png');
          await repo.insertPortrait(id, user.id, 'image/png', null, key);
          return { image: url };
        } catch (err) {
          deps.logger.error('portrait_cdn_upload_failed', { id, err });
        }
      }
      await repo.insertPortrait(id, user.id, 'image/png', png, null);
      const base = (deps.config.PUBLIC_BASE_URL || DEFAULT_API_URL).replace(/\/+$/, '');
      return { image: `${base}/ai/portraits/${id}.png` };
    },

    /**
     * POST /ai/summary — kredi düşmez (rate limit korur)
     * @param {{ locale?: string }} user @param {{ tone: keyof typeof TONES, keywords: string[] }} body
     */
    async summary(user, body) {
      ai.assertEnabled();
      const out = await ai.json({
        system:
          `You write short professional summaries for resumes. Write 2-3 sentences, at most 600 characters, in ${languageName(user.locale)}, ` +
          `without first-person pronouns, in a ${TONES[body.tone]} tone. Output JSON only.`,
        user: `Keywords: ${body.keywords.length ? body.keywords.join(', ') : '(none)'}`,
        schema: SUMMARY_SCHEMA,
        schemaName: 'resume_summary',
        maxTokens: 400,
      });
      const text = typeof out?.summary === 'string' ? out.summary.trim() : '';
      if (!text) throw new AppError(502, 'AI_FAILED', 'Yapay zekâ şu an yanıt veremedi');
      return { summary: text.slice(0, 600) };
    },

    /**
     * POST /ai/description — profil bio iyileştirme; kredi düşmez (rate limit korur)
     * @param {{ locale?: string }} user
     * @param {{ name: string, title: string, location: string, description: string }} body
     */
    async description(user, body) {
      ai.assertEnabled();
      const out = await ai.json({
        system:
          `You polish short professional profile bios for a career app. Write 2-3 sentences, at most 250 characters, in ${languageName(user.locale)}, ` +
          `without first-person pronouns, truthful to the facts given (do not invent employers, degrees or years). Output JSON only.`,
        user:
          `Name: ${body.name || '(none)'}\n` +
          `Job title: ${body.title || '(none)'}\n` +
          `Location: ${body.location || '(none)'}\n` +
          `Current description: ${body.description || '(none — write a polished bio from the job title)'}`,
        schema: DESCRIPTION_SCHEMA,
        schemaName: 'profile_description',
        maxTokens: 300,
      });
      const text = typeof out?.description === 'string' ? out.description.trim() : '';
      if (!text) throw new AppError(502, 'AI_FAILED', 'Yapay zekâ şu an yanıt veremedi');
      return { description: text.slice(0, 250) };
    },

    /**
     * POST /ai/experience — CV deneyim açıklamasını iyileştirir (kredi düşmez, rate limit korur)
     * @param {{ locale?: string }} user @param {{ position: string, company: string, description: string }} body
     */
    async experience(user, body) {
      ai.assertEnabled();
      const out = await ai.json({
        system:
          `You improve the work-experience description of a resume. Write 2-4 concise, achievement-oriented sentences, at most 600 characters, ` +
          `in ${languageName(user.locale)}, without first-person pronouns, truthful to the facts given (do not invent employers, numbers, tools or years). Output JSON only.`,
        user:
          `Position: ${body.position || '(none)'}\n` +
          `Company: ${body.company || '(none)'}\n` +
          `Current description: ${body.description || '(none — write a short description from the position)'}`,
        schema: EXPERIENCE_SCHEMA,
        schemaName: 'experience_description',
        maxTokens: 400,
      });
      const text = typeof out?.description === 'string' ? out.description.trim() : '';
      if (!text) throw new AppError(502, 'AI_FAILED', 'Yapay zekâ şu an yanıt veremedi');
      return { description: text.slice(0, 600) };
    },

    /**
     * POST /cv-builder/photo — CV fotoğrafını kalıcı, herkese açık adrese taşır (AI yok, kredi yok).
     * Portrelerle aynı saklama: CDN (Bunny) varsa orada, yoksa / yükleme olmazsa veritabanında
     * (/ai/portraits/:id.png sunar). Hesap silinince portrelerle birlikte silinir.
     * @param {{ id: string }} user @param {{ photo: string }} body
     */
    async uploadCvPhoto(user, body) {
      const m = DATA_URL.exec(body.photo);
      if (!m) throw new AppError(422, 'PHOTO_REQUIRED', 'Fotoğraf gerekli');
      const mime = body.photo.slice(5, body.photo.indexOf(';'));
      const image = Buffer.from(m[1], 'base64');
      const id = randomUUID();
      if (deps.storage.driver === 'bunny') {
        const key = cvPhotoKey(id, mime);
        try {
          const url = await deps.storage.put(key, image, mime);
          await repo.insertPortrait(id, user.id, mime, null, key);
          return { url };
        } catch (err) {
          deps.logger.error('cv_photo_cdn_upload_failed', { id, err });
        }
      }
      await repo.insertPortrait(id, user.id, mime, image, null);
      const base = (deps.config.PUBLIC_BASE_URL || DEFAULT_API_URL).replace(/\/+$/, '');
      return { url: `${base}/ai/portraits/${id}.png` };
    },

    /**
     * GET /ai/portraits/:id.png — CDN'deyse oranın adresi (yönlendirme), değilse veritabanındaki görsel
     * @param {string} id @returns {Promise<{ redirect: string } | { mime: string, image: Buffer }>}
     */
    async getPortrait(id) {
      const row = await repo.findPortrait(id);
      if (row?.storage_key) return { redirect: deps.storage.url(String(row.storage_key)) };
      if (!row?.image) throw notFound('Görsel bulunamadı', 'PORTRAIT_NOT_FOUND');
      return { mime: String(row.mime), image: /** @type {Buffer} */ (row.image) };
    },

    /** Hesap silinirken: kullanıcının CDN'deki portreleri @param {string} userId */
    async removeUserPortraits(userId) {
      for (const key of await repo.storageKeys(userId)) await deps.storage.remove(key);
    },
  };
  return ai;
}

module.exports = { createService, portraitKey, cvPhotoKey };
