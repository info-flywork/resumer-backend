'use strict';

const { randomUUID } = require('node:crypto');
const { AppError } = require('../../core/errors');
const { COSTS } = require('../credits/service');
const { createTranslationsRepository } = require('./repository');

const nullableString = { type: ['string', 'null'] };
/** @param {Record<string, object>} props */
const obj = (props) => ({ type: 'object', properties: props, required: Object.keys(props), additionalProperties: false });

// OpenAI strict json_schema: bütün alanlar zorunlu, boş değerler null. CvDraft şekliyle aynı.
const OUTPUT_SCHEMA = obj({
  detected_source_language: { type: 'string' },
  subtitle: nullableString,
  content: obj({
    template_id: nullableString,
    full_name: nullableString,
    email: nullableString,
    phone: nullableString,
    location: nullableString,
    photo: nullableString,
    summary: nullableString,
    tone: nullableString,
    keywords: { type: 'array', items: { type: 'string' } },
    experiences: {
      type: 'array',
      items: obj({
        company: nullableString, position: nullableString, location: nullableString, description: nullableString,
        start_date: nullableString, end_date: nullableString, currently_working: { type: 'boolean' },
      }),
    },
    educations: {
      type: 'array',
      items: obj({ school: nullableString, degree: nullableString, field_of_study: nullableString, period: nullableString, description: nullableString }),
    },
    skills: { type: 'array', items: { type: 'string' } },
    certificates: {
      type: 'array',
      items: obj({
        name: nullableString, issuer: nullableString, description: nullableString, issue_date: nullableString,
        expiry_date: nullableString, credential_id: nullableString, url: nullableString, logo: nullableString,
      }),
    },
    links: { type: 'array', items: obj({ url: nullableString, logo: nullableString }) },
  }),
});

const failed = () => new AppError(502, 'AI_FAILED', 'Yapay zekâ şu an yanıt veremedi');

/** Dilin İngilizce adı (istem için) @param {string} code */
function englishName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}

/** Başlıktaki dil adı kullanıcının dilinde @param {string} code @param {string | undefined} locale */
function localName(code, locale) {
  try {
    return new Intl.DisplayNames([(locale || 'en').replace('_', '-')], { type: 'language' }).of(code) || code;
  } catch {
    return englishName(code);
  }
}

/** Çeviri istemi @param {{ target: string, keepFormatting: boolean, proTerminology: boolean }} o */
function buildSystemPrompt({ target, keepFormatting, proTerminology }) {
  return [
    `You translate resumes into ${englishName(target)}. You receive a resume as JSON (fields: content, subtitle) and return JSON in exactly the same structure.`,
    'Translate only human-readable text values. Keep unchanged: e-mail addresses, phone numbers, URLs, photo and logo paths, template_id, tone, credential ids, boolean values, full_name, and proper names (companies, schools, issuers).',
    'Translate month names inside dates (e.g. "Jan 2021" → target language); keep the numbers.',
    'Keep every array the same length and in the same order; null stays null.',
    proTerminology
      ? "Adapt industry-specific terminology to the target language's business usage."
      : 'Use plain, literal translations of terminology.',
    keepFormatting
      ? 'Preserve line breaks, bullet markers and sentence structure.'
      : 'Line breaks and sentence structure may be reorganized for fluency.',
    'Also return detected_source_language as the ISO 639-1 code of the source text and the translated subtitle.',
  ].join(' ');
}

/** @param {unknown} v */
const isStr = (v) => v === null || typeof v === 'string';

/**
 * Çıktıyı doğrular (dizi uzunlukları aynı, tipler doğru) ve korunacak alanları kaynaktan geri yazar.
 * @param {any} out @param {any} src normalizeDraft çıktısı
 */
function mergeTranslated(out, src) {
  const c = out?.content;
  if (!c || typeof c !== 'object') throw failed();
  const lists = ['keywords', 'experiences', 'educations', 'skills', 'certificates', 'links'];
  if (!lists.every((k) => Array.isArray(c[k]) && c[k].length === src[k].length)) throw failed();
  const strOk = (/** @type {any} */ o, /** @type {string[]} */ keys) => o && typeof o === 'object' && keys.every((k) => isStr(o[k]));
  if (!strOk(c, ['location', 'summary']) || !isStr(out.subtitle)) throw failed();
  if (!c.keywords.every((x) => typeof x === 'string') || !c.skills.every((x) => typeof x === 'string')) throw failed();
  if (!c.experiences.every((e) => strOk(e, ['position', 'location', 'description', 'start_date', 'end_date']))) throw failed();
  if (!c.educations.every((e) => strOk(e, ['degree', 'field_of_study', 'period', 'description']))) throw failed();
  if (!c.certificates.every((e) => strOk(e, ['name', 'description', 'issue_date', 'expiry_date']))) throw failed();

  return {
    ...src,
    location: c.location,
    summary: c.summary,
    keywords: c.keywords,
    skills: c.skills,
    experiences: src.experiences.map((s, i) => ({
      ...s,
      position: c.experiences[i].position,
      location: c.experiences[i].location,
      description: c.experiences[i].description,
      start_date: c.experiences[i].start_date,
      end_date: c.experiences[i].end_date,
    })),
    educations: src.educations.map((s, i) => ({
      ...s,
      degree: c.educations[i].degree,
      field_of_study: c.educations[i].field_of_study,
      period: c.educations[i].period,
      description: c.educations[i].description,
    })),
    certificates: src.certificates.map((s, i) => ({
      ...s,
      name: c.certificates[i].name,
      description: c.certificates[i].description,
      issue_date: c.certificates[i].issue_date,
      expiry_date: c.certificates[i].expiry_date,
    })),
  };
}

/**
 * CV çevirisi: kaynak CV'yi yapay zekâyla çevirip draft CV oluşturur (Listeme kaydetme POST /cvs ile).
 * @param {import('../../container').Container} deps
 */
function createService(deps) {
  const repo = createTranslationsRepository(deps.db);

  return {
    /**
     * POST /translations — 1 kredi; yapay zekâ hatasında iade + 502
     * @param {{ id: string, locale?: string }} user
     * @param {{ cv_id: string, target_language: string, keep_formatting: boolean, pro_terminology: boolean }} body
     */
    async translate(user, body) {
      const src = await deps.cvs.getOwned(user, body.cv_id);
      if (src.language === body.target_language) throw new AppError(422, 'SAME_LANGUAGE', 'CV zaten bu dilde');
      deps.ai.assertEnabled();

      const draft = deps.cvs.normalizeDraft({ ...src.content, template_id: src.content?.template_id ?? src.template_id });
      const refId = randomUUID();
      await deps.credits.consume(user, COSTS.translation, 'translation', refId);

      let merged;
      let subtitle;
      let detected;
      try {
        const out = await deps.ai.json({
          system: buildSystemPrompt({ target: body.target_language, keepFormatting: body.keep_formatting, proTerminology: body.pro_terminology }),
          user: JSON.stringify({ subtitle: src.subtitle || null, content: draft }),
          schema: OUTPUT_SCHEMA,
          schemaName: 'resume_translation',
          maxTokens: 4000,
        });
        merged = mergeTranslated(out, draft);
        subtitle = typeof out.subtitle === 'string' ? out.subtitle : '';
        detected = typeof out.detected_source_language === 'string' ? out.detected_source_language.trim().toLowerCase().slice(0, 10) : '';
      } catch (err) {
        await deps.credits.refund(user, COSTS.translation, refId);
        throw err instanceof AppError ? err : failed();
      }

      try {
        const suffix = ` (${localName(body.target_language, user.locale)})`;
        const row = await deps.cvs.create(user, {
          title: src.title.slice(0, 120 - suffix.length) + suffix,
          subtitle,
          template_id: src.template_id,
          content: merged,
          score: src.score,
          is_tailored: Boolean(src.is_tailored),
          language: body.target_language,
          source_cv_id: src.id,
          status: 'draft',
        });
        if (!src.language && detected) await repo.setLanguageIfEmpty(user.id, src.id, detected);
        return {
          cv_id: row.id,
          title: row.title,
          subtitle: row.subtitle,
          updated_text: deps.cvs.toSummary(row, user.locale).updated_text,
          language: body.target_language,
        };
      } catch (err) {
        await deps.credits.refund(user, COSTS.translation, refId);
        throw err;
      }
    },
  };
}

module.exports = { createService, mergeTranslated };
