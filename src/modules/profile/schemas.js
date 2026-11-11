'use strict';

const { z } = require('zod');

// Yanıt şeması Flutter'daki mock JSON'un birebir karşılığıdır (snake_case, aynı tipler).

const Stats = z.object({ cvs: z.number().int(), analyses: z.number().int(), tailored: z.number().int() });

const Profile = z.object({
  name: z.string(),
  email: z.string(),
  title: z.string(),
  phone: z.string(),
  location: z.string(),
  description: z.string(),
  avatar_url: z.string().nullable(),
  is_pro: z.boolean(),
  stats: Stats,
});

const CvStats = z.object({ total: z.number().int(), tailored: z.number().int(), analyses: z.number().int() });

/** Düzenlenebilir metin alanı: string ya da null (boş = temizle) @param {number} max */
const text = (max) => z.string().max(max).nullable().optional();

// Uygulama tüm UserProfile.toJson() alanlarını gönderir; email / is_pro / stats kabul edilir, yok sayılır.
const UpdateBody = z
  .object({
    name: text(100),
    title: text(100),
    phone: text(32),
    location: text(120),
    description: text(1000),
    avatar_url: z
      .string()
      .max(1000)
      .refine((v) => v.trim() === '' || /^https:\/\/[^\s]+$/i.test(v.trim()), 'https adresi olmalı')
      .nullable()
      .optional(),
    email: z.string().max(320).nullable().optional(),
    is_pro: z.boolean().nullable().optional(),
    stats: z
      .object({ cvs: z.number().int().nullable().optional(), analyses: z.number().int().nullable().optional(), tailored: z.number().int().nullable().optional() })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

module.exports = { Profile, CvStats, UpdateBody };
