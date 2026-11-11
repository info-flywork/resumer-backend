'use strict';

/**
 * CV içeriği (saf fonksiyonlar, veritabanı yok): taslak normalleştirme, önizleme,
 * içe aktarılan metni ayrıştırma, dil tespiti, "Updated …" metni.
 * Servis (service.js) ve diğer modüller (tailor, translations, cv_builder) kullanır.
 */
const { langOf, cvDict: dict } = require('../../core/i18n');

/**
 * CV metninden kaba dil tahmini (ISO 639-1). Belirsiz Latin → en.
 * @param {string} text
 * @returns {string | null}
 */
function detectLanguage(text) {
  const s = String(text || '').slice(0, 8000);
  if (!s.trim()) return null;
  if (/[ğüşıöçĞÜŞİÖÇ]/.test(s)) return 'tr';
  if (/[а-яА-ЯёЁ]/.test(s)) return 'ru';
  if (/[\u3040-\u30ff]/.test(s)) return 'ja';
  if (/[\uac00-\ud7af]/.test(s)) return 'ko';
  if (/[\u4e00-\u9fff]/.test(s)) return 'zh';
  if (/[äöüßÄÖÜ]/.test(s) && /\b(und|der|die|das|mit|für)\b/i.test(s)) return 'de';
  if (/[àâæçéèêëïîôœùûüÿ]/i.test(s) && /\b(les|des|une|pour|avec)\b/i.test(s)) return 'fr';
  if (/[àèéìòù]/i.test(s) && /\b(che|per|con|una|degli)\b/i.test(s)) return 'it';
  if (/[áéíóúñü¿¡]/i.test(s) && /\b(que|para|con|una|los)\b/i.test(s)) return 'es';
  if (/[ãáàâçéêíóôõú]/i.test(s) && /\b(que|para|com|uma|não)\b/i.test(s)) return 'pt';
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s)) {
    return 'en'; // Vietnamca desteklenmiyor; Latin varsayılanı en
  }
  return 'en';
}

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
/** CV görünüm seçenekleri (Flutter CvFont / CvSpacing ile aynı) */
const FONTS = Object.freeze(['modern', 'classic', 'minimal']);
const SPACINGS = Object.freeze(['compact', 'normal', 'relaxed']);
/** Geçerliyse metni, değilse null @param {unknown} v @param {(v: string) => boolean} ok */
const oneOf = (v, ok) => (typeof v === 'string' && ok(v.trim()) ? v.trim() : null);

/** Boş olmayanları ayraçla birleştirir */
const join = (parts, sep = ' · ') => parts.map(str).filter(Boolean).join(sep);

/** CV başlığından kişi adı tahmini ("Jordan_Blake_Movers_CV-1" → "Jordan Blake") */
function guessPersonName(title) {
  const t = String(title || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bCV\b/gi, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*\d+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  if (/^(kasiyer|cashier|developer|designer|engineer|manager|intern|laborer|mover|ui\/?ux)s?$/i.test(t)) {
    return '';
  }
  const words = t.split(' ').filter((w) => /^[\p{L}'.-]+$/u.test(w));
  if (words.length >= 2) {
    const occupational = /^(movers?|labou?rers?|helpers?|associates?|cashiers?|kasiyer|developers?|designers?|engineers?|managers?|interns?)$/i;
    let n = Math.min(3, words.length);
    if (n >= 3 && occupational.test(words[n - 1])) n -= 1;
    return words
      .slice(0, n)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return '';
}

/**
 * Deneyim satırını yapılandır: description içinde unvan / şirket / tarih varsa ayır.
 * @param {any} e
 */
function structureExperienceEntry(e) {
  const base = e && typeof e === 'object' ? e : {};
  let position = str(base.position);
  let company = str(base.company);
  let description = str(base.description);
  let startDate = str(base.start_date);
  let endDate = str(base.end_date);
  let currently = Boolean(base.currently_working);
  const location = str(base.location);

  if (position && company) {
    return {
      company: company || null,
      position: position || null,
      location: location || null,
      description: description || null,
      start_date: startDate || null,
      end_date: endDate || null,
      currently_working: currently,
    };
  }

  const lines = description.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const isBullet = (l) => /^[•\-*▪●]/.test(l) || /^\d+[.)]/.test(l);
  let i = 0;
  if (!position && lines[i] && !isBullet(lines[i])) {
    position = lines[i];
    i += 1;
  }
  if (!company && lines[i] && !isBullet(lines[i]) && /[—–·|]|\d{4}/.test(lines[i])) {
    const meta = lines[i];
    i += 1;
    const dateMatch = meta.match(/(\d{4})\s*[–\-—]\s*(.+)$/u);
    if (dateMatch) {
      startDate = startDate || dateMatch[1];
      const endRaw = dateMatch[2].trim();
      currently = currently || /günümüz|present|current|now/i.test(endRaw);
      endDate = currently ? '' : endRaw;
    }
    const beforeDate = dateMatch
      ? meta.slice(0, dateMatch.index).replace(/\s*[·|—–]\s*$/u, '').trim()
      : meta;
    company = beforeDate || meta;
  }
  description = lines.slice(i).join('\n') || description;
  return {
    company: company || null,
    position: position || null,
    location: location || null,
    description: description || null,
    start_date: startDate || null,
    end_date: endDate || null,
    currently_working: currently,
  };
}

/**
 * Eksik kimlik alanlarını CV başlığı / kullanıcı profilinden doldurur (yerinde).
 * @param {any} content
 * @param {{ cvTitle?: string, displayName?: string, email?: string, phone?: string, location?: string }} [meta]
 */
function enrichContentIdentity(content, meta = {}) {
  const c = content && typeof content === 'object' ? content : {};
  if (!str(c.full_name)) {
    // Önce CV başlığından kişi adı (Jordan_Blake…); yoksa profil / hesap adı
    c.full_name = guessPersonName(meta.cvTitle) || str(meta.displayName) || null;
  }
  if (!str(c.email)) c.email = str(meta.email) || null;
  if (!str(c.phone)) c.phone = str(meta.phone) || null;
  if (!str(c.location)) c.location = str(meta.location) || null;
  return c;
}

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
    languages: arr(o.languages).map((e) => ({ name: text(e?.name), level: text(e?.level) })),
    references: arr(o.references).map((e) => ({
      name: text(e?.name),
      position: text(e?.position),
      company: text(e?.company),
      email: text(e?.email),
      phone: text(e?.phone),
    })),
    // Görünüm: vurgu rengi (#rrggbb), yazı tipi, satır / bölüm aralığı
    accent_color: oneOf(o.accent_color, (v) => /^#[0-9a-f]{6}$/i.test(v)),
    font: oneOf(o.font, (v) => FONTS.includes(v)),
    spacing: oneOf(o.spacing, (v) => SPACINGS.includes(v)),
  };
}

/**
 * PDF/DOCX ham metnini kaba CvDraft alanlarına böler.
 * Başlık yoksa tüm metni ÖZET'e yığmaz: kısa özet + deneyim gövdesi.
 * @param {string} text @param {string} fallbackName
 */
function parseImportedCvText(text, fallbackName) {
  const rawLines = String(text || '').split(/\r?\n/).map((l) => l.trim());
  const lines = rawLines.filter(Boolean);
  const headerOf = (line) => {
    if (/^(professional\s+summary|summary|profile|about\s+me|özet|profil)\b/i.test(line)) return 'summary';
    if (/^(work\s+experience|experience|employment|iş\s+deneyimi|deneyim|work\s+history)\b/i.test(line)) {
      return 'experience';
    }
    if (/^(education|eğitim|öğrenim)\b/i.test(line)) return 'education';
    if (/^(skills|beceriler|yetenekler|competenc)/i.test(line)) return 'skills';
    return null;
  };

  /** @type {Record<string, string[]>} */
  const buckets = { summary: [], experience: [], education: [], skills: [], lead: [] };
  let cur = 'lead';
  for (const line of lines) {
    const h = headerOf(line);
    if (h) {
      cur = h;
      continue;
    }
    buckets[cur].push(line);
  }

  const lead = buckets.lead;
  const fromFile = guessPersonName(fallbackName);
  const leadName = lead[0] && !/@|\d{3}/.test(lead[0]) && lead[0].length < 80 ? lead[0] : '';
  const fullName = (leadName || fromFile || fallbackName || 'CV').slice(0, 120);
  const headline = (lead[1] && !/@|\+\d/.test(lead[1]) ? lead[1] : '').slice(0, 120);
  const contactLine = lead.find((l) => /@|\+\d|\(\d{3}\)|\d{3}[-.\s]\d{3}/.test(l) && l !== fullName) || '';
  const emailMatch = contactLine.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0].slice(0, 120) : null;
  const phoneMatch = contactLine.match(/(\+?\d[\d\s().-]{7,}\d)/);
  const phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, ' ').trim().slice(0, 40) : null;
  const locationPart = contactLine
    .split(/[·|•]/)
    .map((p) => p.trim())
    .find((p) => p && !/@/.test(p) && !/\d{3}/.test(p) && p.length < 60);
  const location = locationPart || null;

  let summary = buckets.summary.join('\n').trim();
  let experienceBody = buckets.experience.join('\n').trim();
  const educationBody = buckets.education.join('\n').trim();
  const skillsRaw = buckets.skills.join(', ');

  // Başlıksız yükleme: lead'ten sonrası tüm metin — özeti kısalt, kalanı deneyime koy.
  if (!summary && !experienceBody && lead.length > 2) {
    const bodyLines = lead.slice(contactLine ? 2 : 1);
    const body = bodyLines.join('\n').trim();
    if (body.length > 700) {
      summary = body.slice(0, 500).trim();
      experienceBody = body.slice(500).trim();
    } else {
      summary = body;
    }
  }
  if (!summary) summary = String(text || '').slice(0, 500).trim();

  const skills = skillsRaw
    .split(/[,;•|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60)
    .slice(0, 40);

  const rawExperiences = experienceBody
    ? [{ company: null, position: headline || null, description: experienceBody.slice(0, 50_000) }]
    : [];

  return {
    full_name: fullName,
    headline,
    email,
    phone,
    location,
    summary: summary.slice(0, 50_000) || null,
    experiences: rawExperiences.map(structureExperienceEntry),
    educations: educationBody
      ? [{ school: null, degree: null, description: educationBody.slice(0, 20_000) }]
      : [],
    skills,
  };
}

/**
 * Önizleme verisi (ResumePreviewData): boş bölümler atlanır, başlıklar locale sözlüğünden.
 * content.cv_title / content._fallback_name ile isim tamamlanır.
 * @param {any} content @param {string} [locale]
 */
function buildPreview(content, locale) {
  const d = dict(locale);
  const raw = content && typeof content === 'object' ? content : {};
  const enriched = enrichContentIdentity({ ...raw }, {
    cvTitle: raw.cv_title || raw.title,
    displayName: raw._fallback_name,
    email: raw._fallback_email,
    phone: raw._fallback_phone,
    location: raw._fallback_location,
  });
  const c = normalizeDraft(enriched);
  c.experiences = c.experiences.map(structureExperienceEntry);
  // kind: zengin şablonlar bölümü yan sütuna / ana alana bununla yerleştirir.
  // subtitle + date: kurum ve tarih ayrı (meta eski istemciler için birleşik kalır).
  /** @typedef {{ title?: string, meta?: string, body?: string, subtitle?: string, date?: string }} PreviewItem */
  /** @type {{ kind: string, heading: string, items: PreviewItem[] }[]} */
  const sections = [];
  /** @param {string} kind @param {string} heading @param {PreviewItem[]} items */
  const add = (kind, heading, items) => {
    const kept = items
      .map((i) => Object.fromEntries(Object.entries(i).filter(([, v]) => str(v))))
      .filter((i) => Object.keys(i).length);
    if (kept.length) sections.push({ kind, heading, items: kept });
  };

  // Eski importlar: her şey summary'deyse önizlemede deneyim bölümüne taşı.
  let summary = str(c.summary);
  let experiences = c.experiences;
  const hasExp = experiences.some((e) => str(e.description) || str(e.position) || str(e.company));
  if (summary.length > 900 && !hasExp) {
    const head = summary.slice(0, 500).trim();
    const rest = summary.slice(500).trim();
    summary = head;
    experiences = [structureExperienceEntry({
      company: null, position: null, location: null, description: rest,
      start_date: null, end_date: null, currently_working: false,
    })];
  }

  add('summary', d.summary, [{ body: summary }]);
  add('experience', d.experience, experiences.map((e) => {
    const date = join([e.start_date, e.currently_working ? d.present : e.end_date], ' - ');
    return {
      title: str(e.position),
      meta: join([e.company, date]),
      subtitle: join([e.company, e.location], ', '),
      date,
      body: str(e.description),
    };
  }));
  add('education', d.education, c.educations.map((e) => ({
    title: join([e.degree, e.field_of_study], ', '),
    meta: join([e.school, e.period]),
    subtitle: str(e.school),
    date: str(e.period),
    body: str(e.description),
  })));
  add('skills', d.skills, [{ meta: join(c.skills) }]);
  add('certificates', d.certificates, c.certificates.map((e) => ({ title: str(e.name), meta: str(e.issuer) })));
  add('links', d.links, c.links.map((e) => ({ meta: str(e.url) })));
  add('languages', d.languages, c.languages.map((e) => ({ title: str(e.name), meta: str(e.level) })));
  add('references', d.references, c.references.map((e) => ({
    title: str(e.name),
    meta: join([e.position, e.company]),
    body: join([e.email, e.phone]),
  })));
  const photo = str(c.photo);
  const roleTitle = str(experiences[0]?.position) || str(raw.subtitle) || str(raw.headline) || '';
  return {
    name: str(c.full_name),
    title: roleTitle,
    contact: join([c.email, c.phone, c.location], ' - '),
    email: str(c.email) || null,
    phone: str(c.phone) || null,
    location: str(c.location) || null,
    labels: { contact: d.contact },
    template_id: str(c.template_id) || null,
    photo: photo || null,
    accent_color: c.accent_color,
    font: c.font,
    spacing: c.spacing,
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
  for (const e of c.languages) lines.push(join([`Language: ${str(e.name)}`, e.level]));
  for (const e of c.references) lines.push(join([`Reference: ${str(e.name)}`, e.position, e.company]));
  return lines.filter(Boolean).join('\n');
}

module.exports = {
  text,
  arr,
  str,
  join,
  FONTS,
  SPACINGS,
  detectLanguage,
  updatedText,
  guessPersonName,
  structureExperienceEntry,
  enrichContentIdentity,
  normalizeDraft,
  parseImportedCvText,
  buildPreview,
  contentToText,
};
