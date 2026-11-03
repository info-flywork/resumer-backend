'use strict';

const { randomUUID } = require('node:crypto');
const { isDuplicate } = require('../../config/db');

/**
 * @typedef {{
 *   id: string, firebase_uid: string, email: string | null, email_verified: boolean,
 *   phone: string | null, display_name: string | null, photo_url: string | null,
 *   auth_provider: string, locale: string, created_at: Date, updated_at: Date,
 *   last_login_at: Date | null, deleted_at: Date | null, purge_after: Date | null,
 * }} UserRow
 */

/** @param {import('../../core/auth').DecodedToken} d */
function providerOf(d) {
  const p = d.firebase?.sign_in_provider || '';
  if (p.includes('google')) return 'google';
  if (p.includes('apple')) return 'apple';
  if (p === 'phone') return 'phone';
  if (p === 'password') return 'email';
  if (p === 'anonymous') return 'anonymous';
  return p || 'unknown';
}

/**
 * Kullanıcılar. Kural: bir Firebase kimliği (uid) = bir hesap. E-posta / telefon eşleşmesiyle başka
 * hesaba BAĞLANMAZ (doğrulanmamış e-postayla hesap ele geçirmeyi önler). Aynı kişinin farklı
 * giriş yöntemlerini birleştirmek Firebase'in "hesap bağlama" özelliğiyle istemcide yapılır.
 */
class UserRepository {
  /** @param {import('../../config/db').Db} db */
  constructor(db) {
    this.db = db;
  }

  /** @param {string} uid @returns {Promise<UserRow | null>} */
  findByFirebaseUid(uid) {
    return this.db.one('SELECT * FROM users WHERE firebase_uid = ? LIMIT 1', [uid]);
  }

  /** @param {string} id @returns {Promise<UserRow | null>} */
  findById(id) {
    return this.db.one('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [id]);
  }

  /**
   * Token'dan kullanıcı oluşturur ya da günceller. Silme süresi dolmamış (bekleme süresindeki) hesapla
   * tekrar giriş yapılırsa silme iptal edilir.
   * @param {import('../../core/auth').DecodedToken} d
   * @returns {Promise<{ user: UserRow, created: boolean }>}
   */
  async syncFromToken(d) {
    const fields = {
      email: d.email ?? null,
      email_verified: d.email_verified ? 1 : 0,
      phone: d.phone_number ?? null,
      auth_provider: providerOf(d),
    };
    const existing = await this.findByFirebaseUid(d.uid);
    if (existing) {
      await this.db.run(
        `UPDATE users SET email = COALESCE(?, email), email_verified = GREATEST(email_verified, ?),
           phone = COALESCE(?, phone), last_login_at = UTC_TIMESTAMP(3),
           deleted_at = IF(purge_after > UTC_TIMESTAMP(3), NULL, deleted_at),
           purge_after = IF(purge_after > UTC_TIMESTAMP(3), NULL, purge_after)
         WHERE id = ?`,
        [fields.email, fields.email_verified, fields.phone, existing.id],
      );
      return { user: /** @type {UserRow} */ (await this.findByFirebaseUid(d.uid)), created: false };
    }
    const id = randomUUID();
    try {
      await this.db.run(
        `INSERT INTO users (id, firebase_uid, email, email_verified, phone, display_name, photo_url, auth_provider, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
        [id, d.uid, fields.email, fields.email_verified, fields.phone, d.name?.slice(0, 100) ?? null, d.picture ?? null, fields.auth_provider],
      );
    } catch (err) {
      // Aynı anda iki ilk istek: diğeri oluşturdu
      if (!isDuplicate(err)) throw err;
      return { user: /** @type {UserRow} */ (await this.findByFirebaseUid(d.uid)), created: false };
    }
    return { user: /** @type {UserRow} */ (await this.findByFirebaseUid(d.uid)), created: true };
  }

  /**
   * @param {string} id
   * @param {{ display_name?: string, locale?: string, photo_url?: string | null }} patch
   */
  async update(id, patch) {
    const cols = [];
    const vals = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      cols.push(`${k} = ?`); // anahtarlar sabit: yalnızca bu metodun tipindeki alanlar
      vals.push(v);
    }
    if (cols.length) await this.db.run(`UPDATE users SET ${cols.join(', ')} WHERE id = ?`, [...vals, id]);
    return /** @type {UserRow} */ (await this.findById(id));
  }

  /**
   * Hesabı siler (giriş artık 401 ACCOUNT_DELETED) ve kalıcı silme zamanını yazar.
   * @param {string} id
   * @param {number} graceDays
   */
  async markDeleted(id, graceDays) {
    await this.db.run(
      `UPDATE users SET deleted_at = UTC_TIMESTAMP(3), purge_after = UTC_TIMESTAMP(3) + INTERVAL ? DAY WHERE id = ?`,
      [graceDays, id],
    );
    return this.db.one('SELECT purge_after FROM users WHERE id = ?', [id]);
  }

  /** Kalıcı silinme zamanı gelmiş hesaplar. @param {number} limit @returns {Promise<UserRow[]>} */
  duePurges(limit = 20) {
    return this.db.query(
      'SELECT * FROM users WHERE deleted_at IS NOT NULL AND purge_after <= UTC_TIMESTAMP(3) ORDER BY purge_after LIMIT ?',
      [limit],
    );
  }

  /** @param {string} id */
  hardDelete(id, exec = undefined) {
    return this.db.run('DELETE FROM users WHERE id = ?', [id], exec);
  }
}

module.exports = { UserRepository, providerOf };
