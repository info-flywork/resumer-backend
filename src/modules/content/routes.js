'use strict';

const { defineModule } = require('../../core/route');
const { TemplateList, FaqList } = require('./schemas');

// Yollar Flutter'daki mock rota tablosuyla birebir (GET /templates, GET /faq).
module.exports = defineModule('content', '', [
  {
    method: 'get',
    path: '/templates',
    summary: 'CV şablonları (aktif olanlar, sıraya göre)',
    auth: 'required',
    response: TemplateList,
    handler: ({ deps }) => deps.content.listTemplates(),
  },
  {
    method: 'get',
    path: '/faq',
    summary: 'Sık sorulan sorular (herkese açık; dil: kullanıcı ya da Accept-Language)',
    // Token varsa kullanıcının dili okunur; yoksa anonim de erişir
    auth: 'optional',
    response: FaqList,
    handler: ({ user, req, deps }) => deps.content.listFaq(user?.locale ?? req.get('accept-language')),
  },
]);
