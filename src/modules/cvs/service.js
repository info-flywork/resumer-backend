'use strict';

const { AppError, notFound, forbidden } = require('../../core/errors');
const { cvDict: dict } = require('../../core/i18n');
const { createCvsRepository } = require('./repository');
const {
  str,
  detectLanguage,
  updatedText,
  guessPersonName,
  structureExperienceEntry,
  enrichContentIdentity,
  normalizeDraft,
  parseImportedCvText,
  buildPreview,
  contentToText,
} = require('./content');

/** Ücretsiz kullanıcının en fazla kayıtlı CV sayısı (premium sınırsız) */
const FREE_LIMIT = 3;
const PREMIUM = 'Resumer Pro';

/**
 * CV'ler: kullanıcının CV'leri + diğer modüllere okuma / yazma servisi (deps.cvs).
 * @param {import('../../container').Container} deps
 */
function createService(deps) {
  const repo = createCvsRepository(deps.db);

  /** @param {any} row @param {string} [locale] */
  const toSummary = (row, locale) => ({
    id: row.id,
    title: row.title,
    subtitle: str(row.subtitle) || str(row.exp_position) || str(row.headline) || '',
    updated_text: updatedText(row.updated_at, locale),
    score: row.score == null ? null : Number(row.score),
    is_tailored: Boolean(row.is_tailored),
  });

  /**
   * Kullanıcının CV'si; yoksa / başkasınınsa 404.
   * @param {any} user @param {string} id @param {{ statuses?: string[] }} [opts] @param {import('../../config/db').Executor} [conn]
   */
  async function getOwned(user, id, { statuses = ['saved', 'draft'] } = {}, conn) {
    const row = await repo.find(user.id, id, statuses, conn);
    if (!row) throw notFound('CV bulunamadı', 'CV_NOT_FOUND');
    return row;
  }

  /** @param {any} user @param {import('../../config/db').Executor} [conn] */
  async function assertCanAddCv(user, conn) {
    if (deps.config.DEV_UNLIMITED) return;
    if (await deps.entitlements.isActive(user.id, PREMIUM)) return;
    if ((await repo.countSaved(user.id, conn)) >= FREE_LIMIT) {
      throw forbidden('Ücretsiz planda en fazla 3 CV kaydedebilirsin', 'CV_LIMIT_REACHED');
    }
  }

  return {
    getOwned,
    assertCanAddCv,
    toSummary,
    buildPreview,
    contentToText,
    normalizeDraft,
    enrichContentIdentity,
    structureExperienceEntry,
    guessPersonName,

    /**
     * @param {any} user
     * @param {{ title: string, subtitle?: string, template_id?: string | null, content: any, score?: number | null, is_tailored?: boolean, language?: string | null, source_cv_id?: string | null, status?: string }} d
     * @param {import('../../config/db').Executor} [conn]
     */
    create(user, d, conn) {
      return repo.create(
        user.id,
        {
          title: d.title.slice(0, 120),
          subtitle: (d.subtitle ?? '').slice(0, 120),
          template_id: d.template_id ?? null,
          content: d.content ?? {},
          score: d.score ?? null,
          is_tailored: Boolean(d.is_tailored),
          language: d.language ?? null,
          source_cv_id: d.source_cv_id ?? null,
          status: d.status ?? 'saved',
        },
        conn,
      );
    },

    /** @param {any} user @param {string} id @param {any} content @param {{ score?: number | null }} [opts] @param {import('../../config/db').Executor} [conn] */
    async updateContent(user, id, content, { score } = {}, conn) {
      await repo.updateContent(user.id, id, content, score, conn);
    },

    /** @param {string} cvId @param {number | null} score @param {import('../../config/db').Executor} [conn] */
    async setScore(cvId, score, conn) {
      await repo.setScore(cvId, score, conn);
    },

    /** @param {string} userId */
    counts(userId) {
      return repo.counts(userId);
    },

    /** @param {any} user @param {number} limit */
    async list(user, limit) {
      const rows = await repo.list(user.id, limit);
      return { items: rows.map((r) => toSummary(r, user.locale)) };
    },

    /** @param {any} user @param {string} id */
    async detail(user, id) {
      const row = await getOwned(user, id);
      const src = row.content?.source_file;
      let language = typeof row.language === 'string' && row.language.trim()
        ? row.language.trim().toLowerCase().slice(0, 10)
        : null;
      if (!language) {
        language = detectLanguage(contentToText(row.content));
        if (language) await repo.setLanguageIfEmpty(user.id, row.id, language).catch(() => {});
      }
      return {
        ...toSummary(row, user.locale),
        language,
        preview: buildPreview({
          ...row.content,
          subtitle: row.subtitle,
          cv_title: row.title,
          _fallback_name: user.display_name,
          _fallback_email: user.email,
          _fallback_phone: user.phone,
        }, user.locale),
        source_file: src?.key
          ? { name: String(src.name || 'cv.pdf'), mime: String(src.mime || 'application/pdf') }
          : null,
      };
    },

    /**
     * Orijinal yüklenen dosya (PDF/DOCX baytları).
     * @param {any} user @param {string} id
     */
    async sourceFile(user, id) {
      const row = await getOwned(user, id);
      const src = row.content?.source_file;
      if (!src?.key) throw notFound('Orijinal dosya yok', 'CV_SOURCE_NOT_FOUND');
      const body = await deps.storage.read(String(src.key));
      return {
        body,
        mime: String(src.mime || 'application/octet-stream'),
        name: String(src.name || 'cv.pdf'),
      };
    },

    /** @param {any} user @param {string} id */
    async duplicate(user, id) {
      const src = await getOwned(user, id, { statuses: ['saved'] });
      await assertCanAddCv(user);
      const suffix = dict(user.locale).copy;
      const row = await repo.create(user.id, {
        title: src.title.slice(0, 120 - suffix.length) + suffix,
        subtitle: src.subtitle,
        template_id: src.template_id,
        content: src.content,
        // Skor analize özel; kopya Analizler sekmesinde ekstra satır olmasın.
        score: null,
        is_tailored: Boolean(src.is_tailored),
        language: src.language,
        source_cv_id: src.id,
        status: 'saved',
      });
      return toSummary(row, user.locale);
    },

    /** @param {any} user @param {string} id */
    async remove(user, id) {
      const row = await repo.find(user.id, id, ['saved', 'draft']);
      if (!row) throw notFound('CV bulunamadı', 'CV_NOT_FOUND');
      const key = row.content?.source_file?.key;
      if (!(await repo.remove(user.id, id))) throw notFound('CV bulunamadı', 'CV_NOT_FOUND');
      if (key) await deps.storage.remove(String(key)).catch(() => {});
      return { id };
    },

    /**
     * PDF/DOCX → kayıtlı CV + orijinal dosya saklanır (görüntüleme için).
     * @param {any} user @param {{ file: string, file_name?: string | null }} body
     */
    async importFromFile(user, body) {
      await assertCanAddCv(user);
      const { extractFileText, DATA_URL } = require('../analyses/file_text');
      const match = DATA_URL.exec(body.file);
      if (!match) throw new AppError(422, 'FILE_TYPE_UNSUPPORTED', 'Yalnızca PDF veya DOCX yükleyebilirsin');
      const mime = match[1].toLowerCase();
      const buf = Buffer.from(match[2], 'base64');

      const text = await extractFileText(body.file);
      if (!text) throw new AppError(422, 'SOURCE_EMPTY', 'Dosyadan metin çıkarılamadı');

      const rawName = typeof body.file_name === 'string' ? body.file_name.trim() : '';
      const base = rawName.replace(/\.[^.]+$/, '').trim() || 'CV';
      const title = base.slice(0, 120);
      const fileName = (rawName || `cv.${mime.includes('pdf') ? 'pdf' : 'docx'}`).slice(0, 255);

      const parsed = parseImportedCvText(text, title);

      const content = {
        full_name: parsed.full_name,
        summary: parsed.summary,
        email: parsed.email,
        phone: parsed.phone,
        location: parsed.location,
        experiences: parsed.experiences,
        educations: parsed.educations,
        skills: parsed.skills,
        certificates: [],
        links: [],
      };
      const headline = parsed.headline;
      const row = await repo.create(user.id, {
        title,
        subtitle: headline,
        template_id: 'modern',
        content,
        score: null,
        is_tailored: false,
        language: detectLanguage(text),
        source_cv_id: null,
        status: 'saved',
      });

      const ext = mime.includes('pdf') ? 'pdf' : mime.includes('wordprocessingml') ? 'docx' : 'doc';
      const storageKey = `cvs/${user.id}/${row.id}.${ext}`;
      try {
        await deps.storage.put(storageKey, buf, mime);
        const withFile = {
          ...content,
          source_file: { key: storageKey, name: fileName, mime },
        };
        await repo.updateContent(user.id, row.id, withFile, null);
        return toSummary(await getOwned(user, row.id), user.locale);
      } catch (err) {
        await deps.storage.remove(storageKey).catch(() => {});
        await repo.remove(user.id, row.id).catch(() => {});
        throw err;
      }
    },

    /** @param {any} user @param {{ id?: string | null, title?: string | null, subtitle?: string | null }} body */
    async save(user, body) {
      if (!body.id) throw new AppError(422, 'CV_ID_REQUIRED', 'CV kimliği gerekli');
      const row = await getOwned(user, body.id);
      const patch = { title: body.title ?? null, subtitle: body.subtitle ?? null };
      if (row.status === 'draft') {
        await assertCanAddCv(user);
        await repo.markSaved(user.id, row.id, patch);
      } else {
        await repo.renameSaved(user.id, row.id, patch);
      }
      return toSummary(await getOwned(user, row.id), user.locale);
    },

    /** @param {any} user @param {string} cvId */
    async draft(user, cvId) {
      const row = await getOwned(user, cvId);
      return normalizeDraft({ ...row.content, template_id: row.content?.template_id ?? row.template_id });
    },

    /** 7 günden eski draft'ları siler (1000'erli döngü); toplam silinen */
    async purgeStaleDrafts() {
      let total = 0;
      for (;;) {
        const n = await repo.purgeStaleDrafts();
        total += n;
        if (n < 1000) return total;
      }
    },
  };
}

module.exports = {
  createService,
  FREE_LIMIT,
  buildPreview,
  normalizeDraft,
  updatedText,
  detectLanguage,
  parseImportedCvText,
  guessPersonName,
  structureExperienceEntry,
  enrichContentIdentity,
};
