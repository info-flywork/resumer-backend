'use strict';

const { z } = require('zod');

// Yanıt şemaları Flutter'daki mock JSON'un birebir karşılığıdır (snake_case, aynı tipler).
// Mock'ta bazı önerilerde suggested_text yok → optional (null ise alan atlanır).

const Priority = z.enum(['high', 'medium', 'low']);

const Recommendation = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priority: Priority,
  suggested_text: z.string().optional(),
});

const AnalysisResult = z.object({
  id: z.string(),
  cv_id: z.string().nullable(),
  overall_score: z.number().int(),
  section_scores: z.array(z.object({ key: z.string(), score: z.number().int() })),
  recommendations: z.array(Recommendation),
  ats: z.object({
    score: z.number().int(),
    found_keywords: z.array(z.string()),
    missing_keywords: z.array(z.string()),
    format_checks: z.array(z.object({ label: z.string(), passed: z.boolean() })),
  }),
});

const FixResult = Recommendation.extend({ suggested_text: z.string(), applied: z.boolean() });

/** LinkedIn adresi: yalnızca https, host linkedin.com ya da *.linkedin.com */
const linkedinUrl = z
  .string()
  .max(1000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'https:' && (u.hostname === 'linkedin.com' || u.hostname.endsWith('.linkedin.com'));
    } catch {
      return false;
    }
  }, 'Geçerli bir LinkedIn bağlantısı gir');

const AnalyzeBody = z
  .object({
    cv_id: z.string().max(64).nullable().optional(),
    file_name: z.string().max(255).nullable().optional(),
    linkedin_url: linkedinUrl.nullable().optional(),
  })
  .strict();

const FixBody = z.object({ recommendation_id: z.string().min(1).max(64) }).strict();

// --- Yapay zekâ çıktısı (OpenAI strict json_schema + sunucuda zod ile doğrulama) ---

const SECTION_KEYS = ['experience', 'education', 'skills', 'ats'];
const TARGETS = ['summary', 'experience', 'education', 'skills', 'other'];

const score = z.number().int().min(0).max(100);

const AiAnalysis = z.object({
  overall_score: score,
  section_scores: z
    .array(z.object({ key: z.enum(/** @type {[string, ...string[]]} */ (SECTION_KEYS)), score }))
    .length(4)
    .refine((a) => new Set(a.map((s) => s.key)).size === 4, 'Bölüm anahtarları benzersiz olmalı'),
  recommendations: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(1000),
        priority: Priority,
        target_section: z.enum(/** @type {[string, ...string[]]} */ (TARGETS)),
        suggested_text: z.string().max(2000).nullable(),
      }),
    )
    .min(3)
    .max(7),
  ats: z.object({
    found_keywords: z.array(z.string().max(60)).max(15),
    missing_keywords: z.array(z.string().max(60)).max(15),
    format_checks: z.array(z.object({ label: z.string().max(120), passed: z.boolean() })).min(4).max(6),
  }),
});

/** @param {Record<string, any>} props */
const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const str = { type: 'string' };
const nstr = { type: ['string', 'null'] };

const AI_ANALYSIS_JSON = obj({
  overall_score: { type: 'integer' },
  section_scores: { type: 'array', items: obj({ key: { type: 'string', enum: SECTION_KEYS }, score: { type: 'integer' } }) },
  recommendations: {
    type: 'array',
    items: obj({
      title: str,
      description: str,
      priority: { type: 'string', enum: ['high', 'medium', 'low'] },
      target_section: { type: 'string', enum: TARGETS },
      suggested_text: nstr,
    }),
  },
  ats: obj({
    found_keywords: { type: 'array', items: str },
    missing_keywords: { type: 'array', items: str },
    format_checks: { type: 'array', items: obj({ label: str, passed: { type: 'boolean' } }) },
  }),
});

/** @param {number} max */
const nullableText = (max) => z.string().max(max).nullable();

/** Düzeltilen bölümün şeması (bölüm adına göre) */
const FIX_SECTION = {
  summary: z.object({ summary: z.string().min(1).max(2000) }),
  experience: z.object({
    experiences: z.array(
      z.object({ company: nullableText(200), position: nullableText(200), location: nullableText(200), description: nullableText(4000) }),
    ),
  }),
  education: z.object({
    educations: z.array(
      z.object({ school: nullableText(200), degree: nullableText(200), field_of_study: nullableText(200), period: nullableText(100), description: nullableText(4000) }),
    ),
  }),
  skills: z.object({ skills: z.array(z.string().min(1).max(60)).max(60) }),
};

const FIX_JSON = {
  summary: obj({ summary: str }),
  experience: obj({
    experiences: { type: 'array', items: obj({ company: nstr, position: nstr, location: nstr, description: nstr }) },
  }),
  education: obj({
    educations: { type: 'array', items: obj({ school: nstr, degree: nstr, field_of_study: nstr, period: nstr, description: nstr }) },
  }),
  skills: obj({ skills: { type: 'array', items: str } }),
};

module.exports = { AnalysisResult, FixResult, AnalyzeBody, FixBody, AiAnalysis, AI_ANALYSIS_JSON, FIX_SECTION, FIX_JSON };
