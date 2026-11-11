'use strict';

const { z } = require('zod');
const { AppError, notFound, conflict } = require('../../core/errors');
const { cvDict } = require('../../core/i18n');
const { createTailorRepository } = require('./repository');

const MAX_SKILLS = 50;
const AI_PAYLOAD_LIMIT = 12_000;
const IDS = /** @type {const} */ (['summary', 'experience', 'skills']);

const AI_SCHEMA = {
  type: 'object',
  properties: {
    job_title: { type: 'string' },
    company: { type: 'string' },
    current_score: { type: 'integer' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: [...IDS] },
          suggested: { type: 'string' },
          score_gain: { type: 'integer' },
        },
        required: ['id', 'suggested', 'score_gain'],
        additionalProperties: false,
      },
    },
  },
  required: ['job_title', 'company', 'current_score', 'suggestions'],
  additionalProperties: false,
};

/** Yapay zekâ çıktısının doğrulaması (puanlar sınırlanır) */
const AiOutput = z.object({
  job_title: z.string().trim().min(1),
  company: z.string().trim(),
  current_score: z.number().transform((n) => Math.max(0, Math.min(100, Math.round(n)))),
  suggestions: z.array(
    z.object({
      id: z.enum(IDS),
      suggested: z.string().trim(),
      score_gain: z.number().transform((n) => Math.max(0, Math.min(30, Math.round(n)))),
    }),
  ),
});

const aiFailed = () => new AppError(502, 'AI_FAILED', 'Yapay zekâ şu an yanıt veremedi');
const noSession = () => conflict('Uyarlama oturumu bulunamadı, ilanı yeniden analiz et', 'TAILOR_SESSION_NOT_FOUND');

/** Kullanıcının dilinin İngilizce adı (istem için) @param {string | undefined} locale */
function languageName(locale) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of((locale || 'en').replace('_', '-')) || 'English';
  } catch {
    return 'English';
  }
}

/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v : '');

/** "A, B,, C" → ["A","B","C"] (≤50) @param {string} s */
const splitSkills = (s) => s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, MAX_SKILLS);

/**
 * CV uyarlama: ilan analizi → seçili önerileri uygulama → kaydetme. Oturum kullanıcıya göre tutulur.
 * register.js bu fabrikayı `deps.tailor` olarak kaydeder.
 * @param {import('../../container').Container} deps
 */
function createService(deps) {
  const repo = createTailorRepository(deps.db);

  /**
   * Kullanıcının son 24 saatteki oturumu; yoksa 409.
   * @param {string} userId @param {string[]} statuses @param {import('../../config/db').Executor} [conn] @param {boolean} [lock]
   */
  async function requireSession(userId, statuses, conn, lock) {
    const row = await repo.latest(userId, statuses, conn, lock);
    if (!row) throw noSession();
    return row;
  }

  return {
    /** @param {any} user @param {{ job_url: string, cv_id: string }} body */
    async analyze(user, body) {
      const cv = await deps.cvs.getOwned(user, body.cv_id, { statuses: ['saved'] });
      deps.ai.assertEnabled();
      const jobText = await deps.ai.fetchPageText(body.job_url); // okunamazsa 422 URL_UNREADABLE, deneme hakkı harcanmaz
      const cvText = deps.cvs.contentToText({ ...cv.content, subtitle: cv.subtitle });

      const id = repo.newId();
      await deps.plan.consumeAi(user, 'tailor', id);
      /** @type {z.infer<typeof AiOutput>} */
      let out;
      try {
        const raw = await deps.ai.json({
          system:
            'You tailor resumes to job postings. Given a job posting and a resume, return the job title, the company, ' +
            'current_score (0-100: how well the resume fits the posting) and exactly 3 suggestions with ids summary, experience, skills, in that order. ' +
            'summary: a rewritten professional summary. experience: a rewritten description of the most recent job. ' +
            'skills: a comma-separated skill list adapted to the posting. score_gain (0-30) is the fit improvement of each suggestion. ' +
            `Write suggestions in ${languageName(user.locale)}. Output JSON only.`,
          user: `JOB POSTING:\n${jobText.slice(0, AI_PAYLOAD_LIMIT)}\n\nRESUME:\n${cvText.slice(0, AI_PAYLOAD_LIMIT)}`,
          schema: AI_SCHEMA,
          schemaName: 'tailor_analysis',
          maxTokens: 1200,
        });
        const parsed = AiOutput.safeParse(raw);
        if (!parsed.success || IDS.some((k) => !parsed.data.suggestions.some((s) => s.id === k))) throw aiFailed();
        out = parsed.data;
      } catch (err) {
        await deps.plan.refundAi(user, id);
        throw err instanceof AppError ? err : aiFailed();
      }

      const c = deps.cvs.normalizeDraft(cv.content);
      /** @type {Record<string, string>} */
      const current = {
        summary: str(c.summary),
        experience: str(c.experiences[0]?.description),
        skills: c.skills.join(', '),
      };
      const suggestions = IDS.map((k) => {
        const s = /** @type {any} */ (out.suggestions.find((x) => x.id === k));
        return { id: k, current: current[k], suggested: String(s.suggested), score_gain: Number(s.score_gain) };
      });
      const jobTitle = out.job_title.slice(0, 160);
      const company = out.company.slice(0, 160);
      await repo.create(id, user.id, {
        cv_id: cv.id,
        job_url: body.job_url,
        job_title: jobTitle,
        company,
        current_score: out.current_score,
        suggestions,
      });
      return {
        job_title: jobTitle,
        company,
        current_score: out.current_score,
        new_score: Math.min(100, out.current_score + suggestions.reduce((n, s) => n + s.score_gain, 0)),
        suggestions: suggestions.map(({ id: sid, current: cur, suggested }) => ({ id: sid, current: cur, suggested })),
      };
    },

    /**
     * Seçilen önerileri kaynak CV'nin kopyasına uygular (her çağrıda baştan hesaplanır).
     * @param {any} user @param {string[]} sectionIds
     */
    async apply(user, sectionIds) {
      const session = await requireSession(user.id, ['analyzed', 'applied']);
      const cv = await deps.cvs.getOwned(user, session.cv_id, { statuses: ['saved'] }).catch((err) => {
        throw err instanceof AppError && err.status === 404 ? noSession() : err;
      });
      /** @type {any[]} */
      const suggestions = session.suggestions;
      const content = structuredClone(cv.content ?? {});
      let profile = null;
      try {
        profile = await deps.profile.get(user);
      } catch {
        profile = null;
      }
      deps.cvs.enrichContentIdentity(content, {
        cvTitle: cv.title,
        displayName: profile?.name || user.display_name,
        email: profile?.email || user.email,
        phone: profile?.phone || user.phone,
        location: profile?.location,
      });
      let gain = 0;
      for (const sid of sectionIds) {
        const s = suggestions.find((x) => x.id === sid);
        if (!s) continue;
        if (sid === 'summary') content.summary = s.suggested;
        else if (sid === 'experience') {
          if (!Array.isArray(content.experiences)) content.experiences = [];
          const parsed = deps.cvs.structureExperienceEntry({
            ...(content.experiences[0] || {}),
            description: s.suggested,
            position: null,
            company: null,
            start_date: null,
            end_date: null,
            currently_working: false,
          });
          if (!content.experiences.length) content.experiences.push(parsed);
          else content.experiences[0] = { ...content.experiences[0], ...parsed };
        } else content.skills = splitSkills(String(s.suggested));
        gain += Number(s.score_gain) || 0;
      }
      if (Array.isArray(content.experiences)) {
        content.experiences = content.experiences.map((e) => deps.cvs.structureExperienceEntry(e));
      }
      const roleTitle = content.experiences?.[0]?.position || session.job_title || cv.subtitle;
      const current = Number(session.current_score);
      const newScore = Math.min(100, current + gain);
      await repo.markApplied(user.id, session.id, { ids: sectionIds, content, score: newScore });
      return {
        current_score: current,
        new_score: newScore,
        preview: deps.cvs.buildPreview({
          ...content,
          subtitle: roleTitle,
          cv_title: cv.title,
          _fallback_name: profile?.name || user.display_name,
          _fallback_email: profile?.email || user.email,
          _fallback_phone: profile?.phone || user.phone,
          _fallback_location: profile?.location,
        }, user.locale),
      };
    },

    /** Uyarlanmış CV'yi yeni CV olarak kaydeder; tekrar çağrılırsa aynı cv_id @param {any} user */
    save(user) {
      return deps.db.tx(async (conn) => {
        const session = await requireSession(user.id, ['analyzed', 'applied', 'saved'], conn, true);
        if (session.status === 'saved') return { cv_id: String(session.saved_cv_id) };
        if (session.status === 'analyzed' || !session.applied_content) {
          throw conflict('Önce önerileri uygulamalısın', 'TAILOR_NOT_APPLIED');
        }
        await deps.cvs.assertCanAddCv(user, conn);
        const src = await deps.cvs.getOwned(user, session.cv_id, { statuses: ['saved'] }, conn).catch((err) => {
          throw err instanceof AppError && err.status === 404 ? notFound('Kaynak CV bulunamadı', 'CV_NOT_FOUND') : err;
        });
        const applied = session.applied_content && typeof session.applied_content === 'object'
          ? session.applied_content
          : {};
        const personName = applied.full_name || user.display_name || session.job_title;
        const roleTitle = applied.experiences?.[0]?.position || session.job_title;
        const created = await deps.cvs.create(
          user,
          {
            title: personName ? `${personName} — ${session.job_title}` : `${session.job_title}${cvDict(user.locale).cvSuffix}`,
            subtitle: roleTitle || session.job_title,
            template_id: src.template_id,
            content: applied,
            score: session.new_score,
            is_tailored: true,
            language: src.language,
            source_cv_id: session.cv_id,
            status: 'saved',
          },
          conn,
        );
        await repo.markSaved(user.id, session.id, created.id, conn);
        return { cv_id: created.id };
      });
    },

    /** 7 günden eski oturumları siler; silinen sayı */
    purgeSessions() {
      return repo.purgeOld();
    },
  };
}

module.exports = { createService };
