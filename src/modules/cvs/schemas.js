'use strict';

const { z } = require('zod');

// Yanıt şemaları Flutter'daki mock JSON'un birebir karşılığıdır (snake_case, aynı tipler).

const CvSummary = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  updated_text: z.string(), // "Updated 2 days ago" — kullanıcının dilinde
  score: z.number().int().nullable(), // analiz / oluşturma puanı; yoksa null
  is_tailored: z.boolean(),
});

const CvList = z.object({ items: z.array(CvSummary) });

const PreviewItem = z.object({
  title: z.string().optional(),
  meta: z.string().optional(),
  body: z.string().optional(),
});

const ResumePreviewData = z.object({
  name: z.string(),
  title: z.string(),
  contact: z.string(),
  sections: z.array(z.object({ heading: z.string(), items: z.array(PreviewItem) })),
});

const CvDetail = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  updated_text: z.string(),
  score: z.number().int().nullable(),
  preview: ResumePreviewData,
});

const CvDraft = z.object({
  template_id: z.string().nullable(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  photo: z.string().nullable(),
  summary: z.string().nullable(),
  tone: z.string().nullable(),
  keywords: z.array(z.string()),
  experiences: z.array(
    z.object({
      company: z.string().nullable(),
      position: z.string().nullable(),
      location: z.string().nullable(),
      description: z.string().nullable(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      currently_working: z.boolean(),
    }),
  ),
  educations: z.array(
    z.object({
      school: z.string().nullable(),
      degree: z.string().nullable(),
      field_of_study: z.string().nullable(),
      period: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
  skills: z.array(z.string()),
  certificates: z.array(
    z.object({
      name: z.string().nullable(),
      issuer: z.string().nullable(),
      description: z.string().nullable(),
      issue_date: z.string().nullable(),
      expiry_date: z.string().nullable(),
      credential_id: z.string().nullable(),
      url: z.string().nullable(),
      logo: z.string().nullable(),
    }),
  ),
  links: z.array(z.object({ url: z.string().nullable(), logo: z.string().nullable() })),
});

const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
const IdQuery = z.object({ id: z.string().min(1).max(64) });
const CvIdQuery = z.object({ cv_id: z.string().min(1).max(64) });
const IdBody = z.object({ id: z.string().min(1).max(64) }).strict();

// Uygulama çeviri ekranından tüm CvSummary + preview alanlarını da gönderir; kabul edilir, yok sayılır
// (içerik sunucudadır — BE-12). id yoksa / null ise serviste 422 CV_ID_REQUIRED.
const SaveBody = z
  .object({
    id: z.string().max(64).nullable().optional(),
    title: z.string().trim().min(1).max(120).nullable().optional(),
    subtitle: z.string().max(120).nullable().optional(),
    updated_text: z.string().nullable().optional(),
    score: z.number().nullable().optional(),
    preview: z
      .object({
        name: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        contact: z.string().nullable().optional(),
        sections: z.array(z.any()).nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

module.exports = { CvSummary, CvList, CvDetail, CvDraft, ListQuery, IdQuery, CvIdQuery, IdBody, SaveBody, ResumePreviewData };
