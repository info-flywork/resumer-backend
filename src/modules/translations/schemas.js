'use strict';

const { z } = require('zod');

// Uygulamanın AppLanguage listesi
const LANGUAGES = ['tr', 'en', 'de', 'it', 'fr', 'ja', 'es', 'ru', 'ko', 'hi', 'pt', 'zh'];

// POST /translations — gövde Flutter çağrısındaki alanlarla birebir
const TranslateBody = z
  .object({
    cv_id: z.string().min(1).max(64),
    target_language: z.enum(LANGUAGES),
    keep_formatting: z.boolean(),
    pro_terminology: z.boolean(),
  })
  .strict();

// Yanıt şeması assets/mock/translation_result.json'un birebir karşılığıdır.
const TranslationResult = z.object({
  cv_id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  updated_text: z.string(),
  language: z.string(),
});

module.exports = { LANGUAGES, TranslateBody, TranslationResult };
