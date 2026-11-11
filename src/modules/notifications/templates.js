'use strict';

/**
 * Push bildirim metinleri — kullanıcının diline göre seçilir (users.locale), yoksa varsayılan dil.
 * {param} yer tutucuları notify(..., params) ile doldurulur. Uygulama bildirimleri modülün
 * notifications.js dosyasında, uygulamanın desteklediği TÜM dillerde yazılır.
 */
const DEFAULT_LOCALE = 'en';

/** @type {Record<string, Record<string, { title: string, body: string }>>} */
const TEMPLATES = {
  welcome: {
    tr: { title: 'Hoş geldin {name}!', body: 'Hesabın hazır.' },
    en: { title: 'Welcome {name}!', body: 'Your account is ready.' },
    de: { title: 'Willkommen {name}!', body: 'Dein Konto ist bereit.' },
    it: { title: 'Benvenuto {name}!', body: 'Il tuo account è pronto.' },
    fr: { title: 'Bienvenue {name}!', body: 'Votre compte est prêt.' },
    ja: { title: 'ようこそ、{name}さん！', body: 'アカウントの準備ができました。' },
    es: { title: '¡Bienvenido {name}!', body: 'Tu cuenta está lista.' },
    ru: { title: 'Добро пожаловать, {name}!', body: 'Ваш аккаунт готов.' },
    ko: { title: '{name}님, 환영합니다!', body: '계정이 준비되었습니다.' },
    hi: { title: 'स्वागत है {name}!', body: 'आपका खाता तैयार है।' },
    pt: { title: 'Bem-vindo {name}!', body: 'Sua conta está pronta.' },
    zh: { title: '欢迎，{name}！', body: '您的账户已准备就绪。' },
  },
  // uygulama bildirimleri: modül klasöründeki notifications.js (scripts/register.js)
  ...require('../app.generated').templates,
};

/**
 * @param {string} key
 * @param {string} locale
 * @param {Record<string, unknown>} [params]
 * @returns {{ title: string, body: string } | null}
 */
function render(key, locale, params = {}) {
  const byLang = TEMPLATES[key];
  if (!byLang) return null;
  const lang = (locale || '').split('-')[0];
  const t = byLang[lang] || byLang[DEFAULT_LOCALE] || Object.values(byLang)[0];
  /** @param {string} s */
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => (params[k] == null ? '' : String(params[k])));
  return { title: fill(t.title), body: fill(t.body) };
}

module.exports = { TEMPLATES, DEFAULT_LOCALE, render };
