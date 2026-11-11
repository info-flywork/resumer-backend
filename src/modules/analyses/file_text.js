'use strict';

const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const { AppError } = require('../../core/errors');

const MAX_BYTES = 10 * 1024 * 1024;
const DATA_URL =
  /^data:(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,([A-Za-z0-9+/]+={0,2})$/i;

/**
 * Yüklenen CV data URL → düz metin (PDF / DOC / DOCX).
 * @param {string} dataUrl
 * @returns {Promise<string>}
 */
async function extractFileText(dataUrl) {
  const m = DATA_URL.exec(dataUrl);
  if (!m) {
    throw new AppError(
      422,
      'FILE_TYPE_UNSUPPORTED',
      'Yalnızca PDF veya DOCX yükleyebilirsin',
    );
  }
  const mime = m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) {
    throw new AppError(422, 'FILE_TOO_LARGE', 'Dosya en fazla 10 MB olabilir');
  }
  if (buf.length === 0) {
    throw new AppError(422, 'SOURCE_EMPTY', 'Analiz edilecek içerik bulunamadı');
  }

  try {
    if (mime === 'application/pdf') {
      const parser = new PDFParse({ data: buf });
      try {
        const result = await parser.getText();
        return String(result?.text || '').trim();
      } finally {
        await parser.destroy().catch(() => {});
      }
    }
    // DOC / DOCX — mammoth DOCX'te iyi; eski .doc için de dener
    const out = await mammoth.extractRawText({ buffer: buf });
    return String(out?.value || '').trim();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(422, 'FILE_UNREADABLE', 'Dosya okunamadı; PDF veya DOCX dene');
  }
}

module.exports = { extractFileText, DATA_URL, MAX_BYTES };
