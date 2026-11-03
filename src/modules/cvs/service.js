'use strict';

const { AppError, notFound, forbidden } = require('../../core/errors');
const { createCvsRepository } = require('./repository');

/** Ücretsiz kullanıcının en fazla kayıtlı CV sayısı (premium sınırsız) */
const FREE_LIMIT = 3;
const PREMIUM = 'Resumer Pro';

/** Sunum metinleri (locale sözlüğü); bilinmeyen dil en'e düşer */
const DICT = {
  en: {
    updated: 'Updated {when}', justNow: 'just now', copy: ' (Copy)', present: 'Present',
    summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', certificates: 'Certificates', links: 'Links',
  },
  tr: {
    updated: 'Güncellendi: {when}', justNow: 'az önce', copy: ' (Kopya)', present: 'Devam ediyor',
    summary: 'Özet', experience: 'Deneyim', education: 'Eğitim', skills: 'Yetenekler', certificates: 'Sertifikalar', links: 'Bağlantılar',
  },
};

/** @param {string | undefined} locale */
const langOf = (locale) => (String(locale || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en');
/** @param {string | undefined} locale */
const dict = (locale) => DICT[langOf(locale)];

/** "Updated 2 days ago" — kullanıcının dilinde (mock'taki updated_text) */
function updatedText(date, locale) {
  const d = dict(locale);
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  const steps = /** @type {const} */ ([['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]);
  let when = d.justNow;
  for (const [unit, sec] of steps) {
    if (Math.abs(diff) >= sec) {
      when = new Intl.RelativeTimeFormat(langOf(locale), { numeric: 'auto' }).format(Math.round(diff / sec), unit);
      break;
    }
  }
  return d.updated.replace('{when}', when);
}

/** @param {unknown} v @returns {string | null} */
const text = (v) => (typeof v === 'string' ? v : null);
/** @param {unknown} v @returns {any[]} */
const arr = (v) => (Array.isArray(v) ? v : []);
/** @param {unknown} v @returns {string} */
const str = (v) => (typeof v === 'string' ? v.trim() : '');
/** Boş olmayanları ayraçla birleştirir */
const join = (parts, sep = ' · ') => parts.map(str).filter(Boolean).join(sep);

/**
 * İçeriği CvDraft şekline getirir: eksik dizi → [], eksik metin → null.
 * @param {any} c
 */
function normalizeDraft(c) {
  const o = c && typeof c === 'object' ? c : {};
  return {
    template_id: text(o.template_id),
    full_name: text(o.full_name),
    email: text(o.email),
    phone: text(o.phone),
    location: text(o.location),
    photo: text(o.photo),
    summary: text(o.summary),
    tone: text(o.tone),
    keywords: arr(o.keywords).filter((k) => typeof k === 'string'),
    experiences: arr(o.experiences).map((e) => ({
      company: text(e?.company),
      position: text(e?.position),
      location: text(e?.location),
      description: text(e?.description),
      start_date: text(e?.start_date),
      end_date: text(e?.end_date),
      currently_working: Boolean(e?.currently_working),
    })),
    educations: arr(o.educations).map((e) => ({
      school: text(e?.school),
      degree: text(e?.degree),
      field_of_study: text(e?.field_of_study),
      period: text(e?.period),
      description: text(e?.description),
    })),
    skills: arr(o.skills).filter((s) => typeof s === 'string'),
    certificates: arr(o.certificates).map((e) => ({
      name: text(e?.name),
      issuer: text(e?.issuer),
      description: text(e?.description),
      issue_date: text(e?.issue_date),
      expiry_date: text(e?.expiry_date),
      credential_id: text(e?.credential_id),
      url: text(e?.url),
      logo: text(e?.logo),
    })),
    links: arr(o.links).map((e) => ({ url: text(e?.url), logo: text(e?.logo) })),
  };
}

/**
 * Önizleme verisi (ResumePreviewData): boş bölümler atlanır, başlıklar locale sözlüğünden.
 * @param {any} content @param {string} [locale]
 */
function buildPreview(content, locale) {
  const d = dict(locale);
  const c = normalizeDraft(content);
  /** @type {{ heading: string, items: { title?: string, meta?: string, body?: string }[] }[]} */
  const sections = [];
  /** @param {string} heading @param {{ title?: string, meta?: string, body?: string }[]} items */
  const add = (heading, items) => {
    const kept = items
      .map((i) => Object.fromEntries(Object.entries(i).filter(([, v]) => str(v))))
      .filter((i) => Object.keys(i).length);
    if (kept.length) sections.push({ heading, items: kept });
  };
  add(d.summary, [{ body: str(c.summary) }]);
  add(d.experience, c.experiences.map((e) => ({
    title: str(e.position),
    meta: join([e.company, join([e.start_date, e.currently_working ? d.present : e.end_date], ' - ')]),
    body: str(e.description),
  })));
  add(d.education, c.educations.map((e) => ({
    title: join([e.degree, e.field_of_study], ', '),
    meta: join([e.school, e.period]),
    body: str(e.description),
  })));
  add(d.skills, [{ meta: join(c.skills) }]);
  add(d.certificates, c.certificates.map((e) => ({ title: str(e.name), meta: str(e.issuer) })));
  add(d.links, c.links.map((e) => ({ meta: str(e.url) })));
  return {
    name: str(c.full_name),
    title: str(content?.subtitle) || str(c.experiences[0]?.position),
    contact: join([c.email, c.phone, c.location]),
    sections,
  };
}

/** Yapay zekâ girdisi için düz metin (boş alanlar atlanır) */
function contentToText(content) {
  const c = normalizeDraft(content);
  const lines = [
    str(c.full_name),
    join([c.email, c.phone, c.location]),
    str(c.summary) && `Summary: ${str(c.summary)}`,
  ];
  for (const e of c.experiences) {
    lines.push(join([`Experience: ${str(e.position)}`, e.company, join([e.start_date, e.currently_working ? 'Present' : e.end_date], ' - '), e.description]));
  }
  for (const e of c.educations) lines.push(join([`Education: ${join([e.degree, e.field_of_study], ', ')}`, e.school, e.period, e.description]));
  if (c.skills.length) lines.push(`Skills: ${c.skills.join(', ')}`);
  for (const e of c.certificates) lines.push(join([`Certificate: ${str(e.name)}`, e.issuer, e.description]));
  for (const e of c.links) lines.push(`Link: ${str(e.url)}`);
  return lines.filter(Boolean).join('\n');
}

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
    subtitle: row.subtitle,
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
      return { ...toSummary(row, user.locale), preview: buildPreview({ ...row.content, subtitle: row.subtitle }, user.locale) };
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
        score: src.score,
        is_tailored: Boolean(src.is_tailored),
        language: src.language,
        source_cv_id: src.id,
        status: 'saved',
      });
      return toSummary(row, user.locale);
    },

    /** @param {any} user @param {string} id */
    async remove(user, id) {
      if (!(await repo.remove(user.id, id))) throw notFound('CV bulunamadı', 'CV_NOT_FOUND');
      return { id };
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

module.exports = { createService, FREE_LIMIT, buildPreview, normalizeDraft, updatedText };
