'use strict';

const { z } = require('zod');

const MAX_PHOTO_BYTES = 700 * 1024;
const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

// POST /ai/portrait — uygulama şu an gövde göndermiyor (boş gövde kabul edilir).
const PortraitBody = z
  .object({
    photo: z
      .string()
      .regex(DATA_URL, 'Fotoğraf jpeg, png veya webp data URL olmalı')
      .refine((v) => Buffer.byteLength(v.slice(v.indexOf(',') + 1), 'base64') <= MAX_PHOTO_BYTES, 'Fotoğraf en çok 700 KB olabilir')
      .optional(),
    photo_url: z.string().url().max(1000).optional(),
  })
  .strict();

// POST /ai/summary
const SummaryBody = z
  .object({
    tone: z.string().transform((v) => v.trim().toLowerCase()).pipe(z.enum(['professional', 'dynamic', 'creative', 'friendly'])),
    keywords: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  })
  .strict();

// POST /ai/description — profil "Improve with AI" (form max 250)
const optText = (max) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v == null ? '' : v.trim()))
    .pipe(z.string().max(max));

const DescriptionBody = z
  .object({
    name: optText(100),
    title: optText(120),
    location: optText(120),
    description: optText(1000),
  })
  .strict();

const PortraitParams = z.object({ id: z.string().uuid() });

// Yanıt şemaları assets/mock/ai_portrait.json ve ai_summary.json'un birebir karşılığıdır.
const PortraitResult = z.object({ image: z.string() });
const SummaryResult = z.object({ summary: z.string() });
const DescriptionResult = z.object({ description: z.string() });

module.exports = {
  PortraitBody,
  SummaryBody,
  DescriptionBody,
  PortraitParams,
  PortraitResult,
  SummaryResult,
  DescriptionResult,
  DATA_URL,
};
