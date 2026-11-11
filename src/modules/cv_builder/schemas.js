'use strict';

const { z } = require('zod');

// cvs modülünün schemas.js'i CvDraftBody'yi export ediyorsa o kullanılır; henüz yoksa aynı şema burada tanımlıdır.
const shared = require('../cvs/schemas').CvDraftBody;

/** Metin alanı: string | null, en çok `max` karakter */
const s = (max) => z.string().max(max).nullable().optional();

const Experience = z
  .object({
    company: s(120), position: s(120), location: s(120), description: s(2000),
    start_date: s(40), end_date: s(40), currently_working: z.boolean().optional(),
  })
  .strict();

const Education = z
  .object({ school: s(160), degree: s(120), field_of_study: s(160), period: s(40), description: s(1000) })
  .strict();

const Certificate = z
  .object({
    name: s(160), issuer: s(160), description: s(1000), issue_date: s(40), expiry_date: s(40),
    credential_id: s(100), url: s(1000), logo: s(1000),
  })
  .strict();

const Link = z.object({ url: s(1000), logo: s(1000) }).strict();

const Language = z.object({ name: s(60), level: s(40) }).strict();

const Reference = z
  .object({ name: s(100), position: s(120), company: s(120), email: s(255), phone: s(32) })
  .strict();

// Tarihler serbest metindir ('Ekim 2023'). Boş e-posta kabul edilir, doluysa biçim denetlenir.
const CvDraftBody =
  shared ??
  z
    .object({
      template_id: s(40),
      full_name: s(100),
      email: z
        .string()
        .max(255)
        .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Geçersiz e-posta')
        .nullable()
        .optional(),
      phone: s(32), location: s(120), photo: s(1000), summary: s(2000), tone: s(20),
      keywords: z.array(z.string().max(40)).max(20).optional(),
      experiences: z.array(Experience).max(20).optional(),
      educations: z.array(Education).max(10).optional(),
      skills: z.array(z.string().max(60)).max(50).optional(),
      certificates: z.array(Certificate).max(20).optional(),
      links: z.array(Link).max(10).optional(),
      languages: z.array(Language).max(10).optional(),
      references: z.array(Reference).max(5).optional(),
      // Görünüm: boş / null → şablonun varsayılanı
      accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '#rrggbb olmalı').nullable().optional(),
      font: z.enum(['modern', 'classic', 'minimal']).nullable().optional(),
      spacing: z.enum(['compact', 'normal', 'relaxed']).nullable().optional(),
      pending_certificate: Certificate.nullable().optional(), // saklanmaz, yok sayılır
    })
    .strict();

const ScoreResult = z.object({ score: z.number().int() });
const SubmitResult = z.object({ id: z.string() });
const SubmitQuery = z.object({ cv_id: z.string().min(1).max(64).optional() });

module.exports = { CvDraftBody, ScoreResult, SubmitResult, SubmitQuery };
