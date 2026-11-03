'use strict';

const { AppError, forbidden } = require('../../core/errors');
const { createCvBuilderRepository } = require('./repository');

const PREMIUM = 'Resumer Pro';

/** Otomatik başlık (locale sözlüğü); bilinmeyen dil en'e düşer */
const DICT = { en: { suffix: ' CV' }, tr: { suffix: ' CV' } };

/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v.trim() : '');
/** @param {unknown} v @returns {any[]} */
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Deterministik tamlık puanı (0..100, tam sayı). Yapay zekâ yok.
 * @param {any} d CvDraftBody
 */
function scoreDraft(d) {
  let score = 0;
  for (const k of ['template_id', 'full_name', 'email', 'phone', 'location', 'photo']) if (str(d?.[k])) score += 5;
  const summary = str(d?.summary).length;
  score += summary >= 150 ? 15 : summary >= 40 ? 8 : 0;
  const exps = arr(d?.experiences);
  if (exps.length) {
    score += 20;
    if (exps.every((e) => str(e?.description).length >= 50)) score += 5;
  }
  if (arr(d?.educations).length) score += 10;
  const skills = arr(d?.skills).length;
  score += skills >= 5 ? 10 : skills >= 1 ? 5 : 0;
  if (arr(d?.certificates).length) score += 5;
  if (arr(d?.links).length) score += 5;
  return Math.min(100, score);
}

/**
 * CV oluşturma sihirbazı: puan + taslağı CV olarak kaydetme (deps.cvBuilder).
 * @param {import('../../container').Container} deps
 */
function createService(deps) {
  const repo = createCvBuilderRepository(deps.db);

  return {
    scoreDraft,

    /** @param {any} body */
    score(body) {
      return { score: scoreDraft(body) };
    },

    /** @param {any} user @param {any} body CvDraftBody @param {string} [cvId] */
    async submit(user, body, cvId) {
      const name = str(body.full_name);
      if (!name) throw new AppError(422, 'FULL_NAME_REQUIRED', 'Ad soyad gerekli');
      const templateId = str(body.template_id);
      if (templateId) {
        const tpl = await deps.content.getTemplate(templateId);
        if (!tpl) throw new AppError(422, 'TEMPLATE_NOT_FOUND', 'Şablon bulunamadı');
        if (tpl.is_premium && !(await deps.entitlements.isActive(user.id, PREMIUM))) {
          throw forbidden('Bu şablon Pro üyelere özel', 'PREMIUM_REQUIRED');
        }
      }
      // pending_certificate saklanmaz
      const { pending_certificate: _ignored, ...draft } = body;
      const content = deps.cvs.normalizeDraft(draft);
      const score = scoreDraft(draft);
      const subtitle = str(draft.experiences?.[0]?.position);

      if (cvId) {
        const row = await deps.cvs.getOwned(user, cvId);
        const analyzed = await repo.hasAnalysis(user.id, row.id);
        await deps.cvs.updateContent(user, row.id, content, { score: analyzed ? undefined : score });
        await repo.setSubtitle(user.id, row.id, (subtitle || row.subtitle).slice(0, 120));
        return { id: row.id };
      }
      await deps.cvs.assertCanAddCv(user);
      const suffix = DICT[String(user.locale || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en'].suffix;
      const row = await deps.cvs.create(user, {
        title: name.slice(0, 120 - suffix.length) + suffix,
        subtitle,
        template_id: templateId || null,
        content,
        score,
        status: 'saved',
      });
      return { id: row.id };
    },
  };
}

module.exports = { createService, scoreDraft };
