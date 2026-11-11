'use strict';

/**
 * Uygulama dilleri (Flutter AppLanguage ile aynı 12 kod).
 * Bilinmeyen locale → en.
 */
const LOCALES = Object.freeze([
  'tr', 'en', 'de', 'it', 'fr', 'ja', 'es', 'ru', 'ko', 'hi', 'pt', 'zh',
]);

/** CV sunum metinleri (updated_text, preview başlıkları, kopya eki) */
const CV_DICT = Object.freeze({
  en: {
    updated: 'Updated {when}', justNow: 'just now', copy: ' (Copy)', present: 'Present',
    summary: 'Summary', experience: 'Experience', education: 'Education',
    skills: 'Skills', certificates: 'Certificates', links: 'Links',
    cvSuffix: ' CV',
    contact: 'Contact', languages: 'Languages', references: 'References',
  },
  tr: {
    updated: 'Güncellendi: {when}', justNow: 'az önce', copy: ' (Kopya)', present: 'Devam ediyor',
    summary: 'Özet', experience: 'Deneyim', education: 'Eğitim',
    skills: 'Yetenekler', certificates: 'Sertifikalar', links: 'Bağlantılar',
    cvSuffix: ' CV',
    contact: 'İletişim', languages: 'Diller', references: 'Referanslar',
  },
  de: {
    updated: 'Aktualisiert {when}', justNow: 'gerade eben', copy: ' (Kopie)', present: 'Heute',
    summary: 'Zusammenfassung', experience: 'Berufserfahrung', education: 'Ausbildung',
    skills: 'Kenntnisse', certificates: 'Zertifikate', links: 'Links',
    cvSuffix: ' Lebenslauf',
    contact: 'Kontakt', languages: 'Sprachen', references: 'Referenzen',
  },
  it: {
    updated: 'Aggiornato {when}', justNow: 'proprio ora', copy: ' (Copia)', present: 'Attuale',
    summary: 'Profilo', experience: 'Esperienza', education: 'Istruzione',
    skills: 'Competenze', certificates: 'Certificati', links: 'Link',
    cvSuffix: ' CV',
    contact: 'Contatti', languages: 'Lingue', references: 'Referenze',
  },
  fr: {
    updated: 'Mis à jour {when}', justNow: "à l'instant", copy: ' (Copie)', present: 'Présent',
    summary: 'Résumé', experience: 'Expérience', education: 'Formation',
    skills: 'Compétences', certificates: 'Certificats', links: 'Liens',
    cvSuffix: ' CV',
    contact: 'Contact', languages: 'Langues', references: 'Références',
  },
  ja: {
    updated: '{when}に更新', justNow: 'たった今', copy: '（コピー）', present: '現在',
    summary: '概要', experience: '職歴', education: '学歴',
    skills: 'スキル', certificates: '資格', links: 'リンク',
    cvSuffix: 'の履歴書',
    contact: '連絡先', languages: '語学', references: '推薦者',
  },
  es: {
    updated: 'Actualizado {when}', justNow: 'ahora mismo', copy: ' (Copia)', present: 'Actual',
    summary: 'Resumen', experience: 'Experiencia', education: 'Educación',
    skills: 'Habilidades', certificates: 'Certificados', links: 'Enlaces',
    cvSuffix: ' CV',
    contact: 'Contacto', languages: 'Idiomas', references: 'Referencias',
  },
  ru: {
    updated: 'Обновлено {when}', justNow: 'только что', copy: ' (копия)', present: 'по настоящее время',
    summary: 'О себе', experience: 'Опыт', education: 'Образование',
    skills: 'Навыки', certificates: 'Сертификаты', links: 'Ссылки',
    cvSuffix: ' CV',
    contact: 'Контакты', languages: 'Языки', references: 'Рекомендации',
  },
  ko: {
    updated: '{when} 업데이트됨', justNow: '방금', copy: ' (복사본)', present: '재직 중',
    summary: '요약', experience: '경력', education: '학력',
    skills: '기술', certificates: '자격증', links: '링크',
    cvSuffix: ' 이력서',
    contact: '연락처', languages: '언어', references: '추천인',
  },
  hi: {
    updated: '{when} अपडेट किया गया', justNow: 'अभी', copy: ' (प्रतिलिपि)', present: 'वर्तमान',
    summary: 'सारांश', experience: 'अनुभव', education: 'शिक्षा',
    skills: 'कौशल', certificates: 'प्रमाणपत्र', links: 'लिंक',
    cvSuffix: ' CV',
    contact: 'संपर्क', languages: 'भाषाएँ', references: 'संदर्भ',
  },
  pt: {
    updated: 'Atualizado {when}', justNow: 'agora mesmo', copy: ' (Cópia)', present: 'Atual',
    summary: 'Resumo', experience: 'Experiência', education: 'Formação',
    skills: 'Competências', certificates: 'Certificados', links: 'Links',
    cvSuffix: ' CV',
    contact: 'Contato', languages: 'Idiomas', references: 'Referências',
  },
  zh: {
    updated: '{when}更新', justNow: '刚刚', copy: '（副本）', present: '至今',
    summary: '简介', experience: '工作经历', education: '教育背景',
    skills: '技能', certificates: '证书', links: '链接',
    cvSuffix: '简历',
    contact: '联系方式', languages: '语言', references: '推荐人',
  },
});

/**
 * @param {string | undefined | null} locale
 * @returns {string}
 */
function langOf(locale) {
  const code = String(locale || 'en').toLowerCase().split('-')[0];
  return LOCALES.includes(code) ? code : 'en';
}

/**
 * @param {string | undefined | null} locale
 * @returns {typeof CV_DICT.en}
 */
function cvDict(locale) {
  return CV_DICT[langOf(locale)] || CV_DICT.en;
}

module.exports = { LOCALES, CV_DICT, langOf, cvDict };
