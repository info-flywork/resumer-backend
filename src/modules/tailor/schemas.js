'use strict';

const { z } = require('zod');
const { ResumePreviewData } = require('../cvs/schemas');

// Yanıt şemaları Flutter'daki mock JSON'un birebir karşılığıdır (snake_case, aynı tipler).

const SECTION_IDS = /** @type {const} */ (['summary', 'experience', 'skills']);

const Suggestion = z.object({
  id: z.enum(SECTION_IDS),
  current: z.string(),
  suggested: z.string(),
});

const TailorAnalysis = z.object({
  job_title: z.string(),
  company: z.string(),
  current_score: z.number().int(),
  new_score: z.number().int(),
  suggestions: z.array(Suggestion),
});

const AnalyzeBody = z
  .object({
    job_url: z.string().trim().max(2000).regex(/^https?:\/\/\S+$/i, 'http(s) adresi olmalı'),
    cv_id: z.string().min(1).max(64),
  })
  .strict();

const ApplyBody = z
  .object({
    section_ids: z
      .array(z.enum(SECTION_IDS))
      .max(3)
      .refine((a) => new Set(a).size === a.length, 'Bölümler tekrarlanamaz'),
  })
  .strict();

const TailorPreview = z.object({
  current_score: z.number().int(),
  new_score: z.number().int(),
  preview: ResumePreviewData,
});

const SaveBody = z.object({}).strict();
const SaveResult = z.object({ cv_id: z.string() });

module.exports = { SECTION_IDS, Suggestion, TailorAnalysis, AnalyzeBody, ApplyBody, TailorPreview, SaveBody, SaveResult };
