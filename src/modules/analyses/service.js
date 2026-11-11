'use strict';

const { randomUUID } = require('node:crypto');
const { AppError, conflict, notFound } = require('../../core/errors');
const { COSTS } = require('../credits/service');
const { createAnalysesRepository } = require('./repository');
const { AiAnalysis, AI_ANALYSIS_JSON, FIX_SECTION, FIX_JSON } = require('./schemas');

const MAX_TEXT = 20_000;
const aiFailed = () => new AppError(502, 'AI_FAILED', 'Yapay zekâ şu an yanıt veremedi');

/** Kullanıcının dilinin İngilizce adı (istem için) @param {string | undefined} locale */
function languageName(locale) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of((locale || 'en').replace('_', '-')) || 'English';
  } catch {
    return 'English';
  }
}

/** @param {unknown} v @param {number} max */
const clip = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : v);

/** @param {unknown} v @returns {string | null} */
const textOrNull = (v) => (typeof v === 'string' ? v : null);

/**
 * Düzeltilen bölümü içeriğe işler; yalnızca metin alanları değişir (tarihler vb. korunur).
 * @param {string} section @param {any} content @param {any} fixed doğrulanmış yapay zekâ çıktısı
 * @returns {{ content: any, text: string }}
 */
function applySection(section, content, fixed) {
  const next = { ...content };
  if (section === 'experience') {
    const old = Array.isArray(content.experiences) ? content.experiences : [];
    next.experiences = old.map((/** @type {any} */ e, /** @type {number} */ i) => ({ ...e, ...fixed.experiences[i] }));
    return { content: next, text: next.experiences.map((/** @type {any} */ e) => e.description).filter(Boolean).join('\n') };
  }
  if (section === 'education') {
    const old = Array.isArray(content.educations) ? content.educations : [];
    next.educations = old.map((/** @type {any} */ e, /** @type {number} */ i) => ({ ...e, ...fixed.educations[i] }));
    return { content: next, text: next.educations.map((/** @type {any} */ e) => e.description).filter(Boolean).join('\n') };
  }
  if (section === 'skills') {
    next.skills = fixed.skills;
    return { content: next, text: fixed.skills.join(', ') };
  }
  next.summary = fixed.summary;
  return { content: next, text: fixed.summary };
}

/**
 * CV içeriğinin yalnızca ilgili bölümü (yapay zekâya gönderilir).
 * @param {string} section @param {any} c
 */
function pickSection(section, c) {
  if (section === 'experience') {
    return {
      experiences: (Array.isArray(c.experiences) ? c.experiences : []).map((/** @type {any} */ e) => ({
        company: textOrNull(e?.company),
        position: textOrNull(e?.position),
        location: textOrNull(e?.location),
        description: textOrNull(e?.description),
      })),
    };
  }
  if (section === 'education') {
    return {
      educations: (Array.isArray(c.educations) ? c.educations : []).map((/** @type {any} */ e) => ({
        school: textOrNull(e?.school),
        degree: textOrNull(e?.degree),
        field_of_study: textOrNull(e?.field_of_study),
        period: textOrNull(e?.period),
        description: textOrNull(e?.description),
      })),
    };
  }
  if (section === 'skills') return { skills: Array.isArray(c.skills) ? c.skills : [] };
  return { summary: textOrNull(c.summary) ?? '' };
}

/**
 * Sütun sınırlarını aşan metinleri kırpar (şema doğrulamasından önce).
 * @param {any} out
 */
function trimAnalysis(out) {
  if (!out || typeof out !== 'object') return out;
  const ats = out.ats && typeof out.ats === 'object' ? out.ats : null;
  return {
    ...out,
    recommendations: Array.isArray(out.recommendations)
      ? out.recommendations.map((/** @type {any} */ r) => ({
          ...r,
          title: clip(r?.title, 200),
          description: clip(r?.description, 1000),
          suggested_text: clip(r?.suggested_text ?? null, 2000),
        }))
      : out.recommendations,
    ats: ats
      ? {
          ...ats,
          found_keywords: Array.isArray(ats.found_keywords) ? ats.found_keywords.slice(0, 15) : ats.found_keywords,
          missing_keywords: Array.isArray(ats.missing_keywords) ? ats.missing_keywords.slice(0, 15) : ats.missing_keywords,
        }
      : out.ats,
  };
}

/**
 * CV analizi ve öneri uygulama. register.js bu fabrikayı `deps.analyses` olarak kaydeder.
 * @param {import('../../container').Container} deps
 */
function createService(deps) {
  const repo = createAnalysesRepository(deps.db);

  return {
    /** @param {string} userId */
    countByUser: (userId) => repo.countByUser(userId),

    /** @param {string} cvId */
    hasForCv: (cvId) => repo.hasForCv(cvId),

    /**
     * GET /analyses/latest?cv_id= — kayıtlı son analiz sonucu.
     * @param {any} user @param {string} cvId
     */
    async latest(user, cvId) {
      await deps.cvs.getOwned(user, cvId);
      const row = await repo.findLatestByCv(user.id, cvId);
      if (!row) throw notFound('Bu CV için analiz bulunamadı', 'ANALYSIS_NOT_FOUND');
      const { analysis: a, recommendations } = row;
      const sectionScores = typeof a.section_scores === 'string'
        ? JSON.parse(a.section_scores)
        : a.section_scores;
      const ats = typeof a.ats === 'string' ? JSON.parse(a.ats) : a.ats;
      return {
        id: a.id,
        cv_id: a.cv_id,
        overall_score: a.overall_score,
        section_scores: sectionScores,
        recommendations: recommendations.map((rec) => ({
          id: rec.id,
          title: rec.title,
          description: rec.description,
          priority: rec.priority,
          ...(rec.suggested_text ? { suggested_text: rec.suggested_text } : {}),
          ...(rec.applied_at ? { applied: true } : {}),
        })),
        ats,
      };
    },

    /**
     * POST /analyses — kaynak: cv_id → file (PDF/DOCX) → linkedin_url
     * @param {any} user
     * @param {{ cv_id?: string | null, file_name?: string | null, file?: string | null, linkedin_url?: string | null }} body
     */
    async analyze(user, body) {
      const { extractFileText } = require('./file_text');
      /** @type {{ text: string, source: 'cv' | 'linkedin' | 'file', label: string | null, cvId: string | null }} */
      let src;
      if (body.cv_id) {
        const cv = await deps.cvs.getOwned(user, body.cv_id);
        src = { text: deps.cvs.contentToText(cv.content), source: 'cv', label: cv.title, cvId: cv.id };
      } else if (body.file) {
        deps.ai.assertEnabled();
        const text = await extractFileText(body.file);
        if (!text) throw new AppError(422, 'SOURCE_EMPTY', 'Dosyadan metin okunamadı');
        src = {
          text,
          source: 'file',
          label: (body.file_name || 'upload.pdf').slice(0, 255),
          cvId: null,
        };
      } else if (body.linkedin_url) {
        deps.ai.assertEnabled();
        const text = await deps.ai.fetchPageText(body.linkedin_url);
        src = { text, source: 'linkedin', label: body.linkedin_url.slice(0, 255), cvId: null };
      } else if (body.file_name) {
        throw new AppError(
          422,
          'FILE_UPLOAD_NOT_SUPPORTED',
          'Dosya içeriği eksik; PDF/DOCX’i yeniden seç',
        );
      } else {
        throw new AppError(422, 'SOURCE_REQUIRED', 'Analiz için bir CV ya da LinkedIn bağlantısı gerekli');
      }
      deps.ai.assertEnabled();
      if (!src.text.trim()) throw new AppError(422, 'SOURCE_EMPTY', 'Analiz edilecek içerik bulunamadı');

      const id = randomUUID();
      await deps.credits.consume(user, COSTS.analysis, 'analysis', id);
      try {
        const out = await deps.ai.json({
          system:
            `You are an expert resume reviewer and ATS specialist. Analyze the resume text and output JSON only, written in ${languageName(user.locale)}. ` +
            'overall_score and section scores are integers 0-100. section_scores must contain exactly the keys experience, education, skills, ats. ' +
            'Give 3-7 concrete recommendations; target_section says which CV part each one improves (use "other" if none); ' +
            'suggested_text is ready-to-paste replacement text (max 400 characters) or null. ' +
            'ats: up to 15 found_keywords, up to 15 missing_keywords, 4-6 format_checks with a short label and passed flag. Keywords stay in their original language.',
          user: src.text.slice(0, MAX_TEXT),
          schema: AI_ANALYSIS_JSON,
          schemaName: 'resume_analysis',
          maxTokens: 2000,
        });
        const parsed = AiAnalysis.safeParse(trimAnalysis(out));
        if (!parsed.success) throw aiFailed();
        const r = parsed.data;
        const atsScore = /** @type {number} */ (r.section_scores.find((s) => s.key === 'ats')?.score);
        const ats = { score: atsScore, ...r.ats };

        const recIds = await deps.db.tx(async (conn) => {
          const ids = await repo.insert(
            user.id,
            { id, cv_id: src.cvId, source: src.source, source_label: src.label, overall_score: r.overall_score, section_scores: r.section_scores, ats },
            r.recommendations.map((rec) => ({ ...rec, suggested_text: rec.suggested_text ?? null })),
            conn,
          );
          if (src.cvId) await deps.cvs.setScore(src.cvId, r.overall_score, conn);
          return ids;
        });
        return {
          id,
          cv_id: src.cvId,
          overall_score: r.overall_score,
          section_scores: r.section_scores,
          recommendations: r.recommendations.map((rec, i) => ({
            id: recIds[i],
            title: rec.title,
            description: rec.description,
            priority: rec.priority,
            ...(rec.suggested_text ? { suggested_text: rec.suggested_text } : {}),
          })),
          ats,
        };
      } catch (err) {
        await deps.credits.refund(user, COSTS.analysis, id);
        throw err;
      }
    },

    /**
     * POST /analyses/fix — kredi düşmez
     * @param {any} user @param {string} recommendationId
     */
    async fix(user, recommendationId) {
      const rec = await repo.findRecommendation(user.id, recommendationId);
      if (!rec) throw notFound('Öneri bulunamadı', 'RECOMMENDATION_NOT_FOUND');
      if (rec.applied_at) throw conflict('Bu öneri zaten uygulandı', 'ALREADY_APPLIED');
      if (!rec.cv_id) throw conflict('Bu öneriyi uygulayacak bir CV yok', 'NO_CV_TO_FIX');
      deps.ai.assertEnabled();

      const cv = await deps.cvs.getOwned(user, rec.cv_id);
      const content = cv.content && typeof cv.content === 'object' ? cv.content : {};
      /** @type {'summary' | 'experience' | 'education' | 'skills'} */
      const section = rec.target_section === 'other' ? 'summary' : rec.target_section;
      const out = await deps.ai.json({
        system:
          'You improve one section of a resume according to a recommendation. Keep facts truthful; do not invent employers, dates or degrees. ' +
          `Write in ${languageName(user.locale)}. Return the same structure with the same number of items, JSON only.`,
        user: JSON.stringify({
          recommendation: { title: rec.title, description: rec.description, suggested_text: rec.suggested_text },
          section: pickSection(section, content),
        }),
        schema: FIX_JSON[section],
        schemaName: 'resume_section_fix',
        maxTokens: 2000,
      });
      const parsed = FIX_SECTION[section].safeParse(out);
      if (!parsed.success) throw aiFailed();
      const fixed = /** @type {any} */ (parsed.data);
      const oldItems = section === 'experience' ? content.experiences : section === 'education' ? content.educations : null;
      const newItems = section === 'experience' ? fixed.experiences : section === 'education' ? fixed.educations : null;
      if ((Array.isArray(oldItems) ? oldItems.length : 0) !== (newItems ? newItems.length : 0)) throw aiFailed();

      const { content: next, text } = applySection(section, content, fixed);
      await deps.db.tx(async (conn) => {
        if (!(await repo.markApplied(user.id, rec.id, conn))) throw conflict('Bu öneri zaten uygulandı', 'ALREADY_APPLIED');
        await deps.cvs.updateContent(user, rec.cv_id, next, {}, conn);
      });
      return {
        id: rec.id,
        title: rec.title,
        description: rec.description,
        priority: rec.priority,
        suggested_text: String(text || rec.suggested_text || '').slice(0, 2000),
        applied: true,
      };
    },
  };
}

module.exports = { createService };
