'use strict';

/**
 * Beklenen (iş kuralı) hataları. Servisler bunları fırlatır; hata ara katmanı Flutter'ın beklediği
 * zarfa çevirir: { status: "error", message, code, data: null, errors? }.
 * Beklenmeyen hatalar 500 olur ve ayrıntısı istemciye gönderilmez.
 */
class AppError extends Error {
  /**
   * @param {number} status HTTP durum kodu
   * @param {string} code Makinece okunur kod (BÜYÜK_HARF)
   * @param {string} message Kullanıcıya gösterilebilir kısa mesaj
   * @param {unknown} [details] Ek bilgi (ör. alan hataları)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message = 'Geçersiz istek', code = 'BAD_REQUEST', details) =>
  new AppError(400, code, message, details);
const unauthorized = (message = 'Oturum gerekli', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);
const forbidden = (message = 'Bu işlem için yetkin yok', code = 'FORBIDDEN') =>
  new AppError(403, code, message);
const notFound = (message = 'Bulunamadı', code = 'NOT_FOUND') => new AppError(404, code, message);
const conflict = (message = 'Çakışma', code = 'CONFLICT', details) =>
  new AppError(409, code, message, details);
const unprocessable = (message = 'Geçersiz veri', details) =>
  new AppError(422, 'VALIDATION_ERROR', message, details);
const tooMany = (message = 'Çok fazla istek, biraz sonra tekrar dene') =>
  new AppError(429, 'RATE_LIMITED', message);
const unavailable = (message = 'Servis geçici olarak kullanılamıyor', code = 'UNAVAILABLE') =>
  new AppError(503, code, message);

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  tooMany,
  unavailable,
};
