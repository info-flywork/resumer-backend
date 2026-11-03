'use strict';

const { z } = require('zod');
const { defineModule } = require('../../core/route');
const { CvSummary, CvList, CvDetail, CvDraft, ListQuery, IdQuery, CvIdQuery, IdBody, SaveBody } = require('./schemas');

// Yollar Flutter'daki mock rota tablosuyla birebir aynı (GET /cvs/detail?id=…, GET /cv-builder/draft?cv_id=…).
// Modül iki önek taşır (/cvs, /cv-builder): prefix boş, yollar tam yazılır.
module.exports = defineModule('cvs', '', [
  {
    method: 'get',
    path: '/cvs',
    summary: 'Kullanıcının kayıtlı CV listesi (son güncellenen önce)',
    auth: 'required',
    request: { query: ListQuery },
    response: CvList,
    handler: ({ user, query, deps }) => deps.cvs.list(user, query.limit),
  },
  {
    method: 'get',
    path: '/cvs/detail',
    summary: 'CV detayı ve önizleme verisi',
    auth: 'required',
    request: { query: IdQuery },
    response: CvDetail,
    handler: ({ user, query, deps }) => deps.cvs.detail(user, query.id),
  },
  {
    method: 'post',
    path: '/cvs/duplicate',
    summary: 'CV kopyala (ücretsiz planda sınırlı)',
    auth: 'required',
    rateLimit: { windowMs: 60_000, max: 20 },
    request: { body: IdBody },
    response: CvSummary,
    handler: ({ user, body, deps }) => deps.cvs.duplicate(user, body.id),
  },
  {
    method: 'delete',
    path: '/cvs',
    summary: 'CV sil (kalıcı)',
    auth: 'required',
    request: { query: IdQuery },
    response: z.object({ id: z.string() }),
    handler: ({ user, query, deps }) => deps.cvs.remove(user, query.id),
  },
  {
    method: 'post',
    path: '/cvs',
    summary: "Taslak CV'yi Listeme kaydet / başlığı güncelle",
    auth: 'required',
    rateLimit: { windowMs: 60_000, max: 30 }, // OWASP API6: otomasyonla toplu CV açma
    request: { body: SaveBody },
    response: CvSummary,
    handler: ({ user, body, deps }) => deps.cvs.save(user, body),
  },
  {
    method: 'get',
    path: '/cv-builder/draft',
    summary: 'Düzenleme için CV taslağı (CvDraft)',
    auth: 'required',
    request: { query: CvIdQuery },
    response: CvDraft,
    handler: ({ user, query, deps }) => deps.cvs.draft(user, query.cv_id),
  },
]);
