'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');

/**
 * Firebase Admin: yalnızca kimlik doğrulama (ID token) ve hesap silmede Firebase kullanıcısını silmek için.
 * FIREBASE_SERVICE_ACCOUNT: servis hesabı JSON dosyasının yolu ya da base64 JSON. Boşsa null döner
 * (testler sahte doğrulayıcı kullanır; canlıda server.js boş değeri kabul etmez).
 * @param {{ FIREBASE_SERVICE_ACCOUNT: string, FIREBASE_PROJECT_ID: string }} config
 * @returns {import('firebase-admin/app').App | null}
 */
function createFirebaseApp(config) {
  const raw = config.FIREBASE_SERVICE_ACCOUNT.trim();
  if (!raw) return null;
  const existing = getApps()[0];
  if (existing) return existing;
  let json;
  if (raw.startsWith('{')) json = JSON.parse(raw);
  else if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 200) json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  else json = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), raw), 'utf8'));
  return initializeApp({
    credential: cert(json),
    projectId: config.FIREBASE_PROJECT_ID || json.project_id,
  });
}

module.exports = { createFirebaseApp };
