'use strict';

const { z } = require('zod');

// Yanıt şemaları Flutter'daki mock JSON'un birebir karşılığıdır (snake_case, aynı tipler).

const TemplateItem = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  image: z.string(), // Flutter asset yolu (assets/images/...), olduğu gibi döner
  is_premium: z.boolean(), // mock'ta yok, ek alan
});

const TemplateList = z.object({ items: z.array(TemplateItem) });

const FaqItem = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
});

const FaqList = z.object({ items: z.array(FaqItem) });

module.exports = { TemplateItem, TemplateList, FaqItem, FaqList };
