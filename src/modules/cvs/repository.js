'use strict';

const { randomUUID } = require('node:crypto');

/**
 * Yalnızca SQL. Kullanıcıya ait her sorgu user_id = ? ile filtrelenir. `conn` verilirse işlem içinde çalışır.
 * @param {import('../../config/db').Db} db
 */
function createCvsRepository(db) {
  return {
    /** @param {string} userId @param {number} limit */
    list(userId, limit) {
      return db.query(
        // liste hücresi: içerik (JSON) çekilmez — detay ucu tam kaydı ayrı okur
        `SELECT id, title, subtitle, updated_at, score, is_tailored,
          JSON_UNQUOTE(JSON_EXTRACT(content, '$.experiences[0].position')) AS exp_position,
          JSON_UNQUOTE(JSON_EXTRACT(content, '$.headline')) AS headline
         FROM cvs WHERE user_id = ? AND status = 'saved'
         ORDER BY updated_at DESC, id DESC LIMIT ?`,
        [userId, limit],
      );
    },

    /**
     * @param {string} userId @param {string} id @param {string[]} statuses (izin listesi: saved | draft)
     * @param {import('../../config/db').Executor} [conn]
     */
    find(userId, id, statuses, conn) {
      const list = statuses.filter((s) => s === 'saved' || s === 'draft');
      if (!list.length) return Promise.resolve(null);
      return db.one(
        `SELECT * FROM cvs WHERE id = ? AND user_id = ? AND status IN (${list.map(() => '?').join(', ')})`,
        [id, userId, ...list],
        conn,
      );
    },

    /** @param {string} userId @param {import('../../config/db').Executor} [conn] */
    async countSaved(userId, conn) {
      const r = await db.one("SELECT COUNT(*) AS n FROM cvs WHERE user_id = ? AND status = 'saved'", [userId], conn);
      return Number(r?.n ?? 0);
    },

    /** @param {string} userId */
    async counts(userId) {
      // analyses = Analizler sekmesiyle aynı: skoru olan kayıtlı CV sayısı
      const r = await db.one(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(is_tailored), 0) AS tailored,
                COALESCE(SUM(score IS NOT NULL), 0) AS analyzed
         FROM cvs WHERE user_id = ? AND status = 'saved'`,
        [userId],
      );
      return {
        total: Number(r?.total ?? 0),
        tailored: Number(r?.tailored ?? 0),
        analyzed: Number(r?.analyzed ?? 0),
      };
    },

    /**
     * @param {string} userId
     * @param {{ title: string, subtitle: string, template_id: string | null, content: any, score: number | null, is_tailored: boolean, language: string | null, source_cv_id: string | null, status: string }} d
     * @param {import('../../config/db').Executor} [conn]
     */
    async create(userId, d, conn) {
      const id = randomUUID();
      await db.run(
        `INSERT INTO cvs (id, user_id, title, subtitle, template_id, content, score, is_tailored, language, source_cv_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, d.title, d.subtitle, d.template_id, JSON.stringify(d.content), d.score, d.is_tailored ? 1 : 0, d.language, d.source_cv_id, d.status],
        conn,
      );
      return /** @type {any} */ (await this.find(userId, id, ['saved', 'draft'], conn));
    },

    /**
     * @param {string} userId @param {string} id @param {any} content @param {number | null | undefined} score
     * @param {import('../../config/db').Executor} [conn]
     */
    updateContent(userId, id, content, score, conn) {
      return db.run(
        'UPDATE cvs SET content = ?, score = COALESCE(?, score), updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND user_id = ?',
        [JSON.stringify(content), score ?? null, id, userId],
        conn,
      );
    },

    /** @param {string} id @param {number | null} score @param {import('../../config/db').Executor} [conn] */
    setScore(id, score, conn) {
      return db.run('UPDATE cvs SET score = ? WHERE id = ?', [score, id], conn);
    },

    /** Dil boşsa doldur @param {string} userId @param {string} cvId @param {string} language */
    setLanguageIfEmpty(userId, cvId, language) {
      return db.run(
        'UPDATE cvs SET language = ? WHERE id = ? AND user_id = ? AND language IS NULL',
        [language, cvId, userId],
      );
    },

    /**
     * Listeme kaydet / başlık güncelle. null alan değişmez.
     * @param {string} userId @param {string} id @param {{ title: string | null, subtitle: string | null }} d
     * @param {import('../../config/db').Executor} [conn]
     */
    markSaved(userId, id, d, conn) {
      return db.run(
        `UPDATE cvs SET status = 'saved', title = COALESCE(?, title), subtitle = COALESCE(?, subtitle), updated_at = UTC_TIMESTAMP(3)
         WHERE id = ? AND user_id = ?`,
        [d.title, d.subtitle, id, userId],
        conn,
      );
    },

    /** Yalnızca başlık / alt başlık (zaten kayıtlı CV; durum değişmez) */
    renameSaved(userId, id, d, conn) {
      return db.run(
        'UPDATE cvs SET title = COALESCE(?, title), subtitle = COALESCE(?, subtitle), updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND user_id = ?',
        [d.title, d.subtitle, id, userId],
        conn,
      );
    },

    /** @param {string} userId @param {string} id → silindi mi */
    async remove(userId, id) {
      const r = await db.run('DELETE FROM cvs WHERE id = ? AND user_id = ?', [id, userId]);
      return r.affectedRows > 0;
    },

    /** 7 günden eski draft'ları (en çok 1000) siler; silinen satır sayısı */
    async purgeStaleDrafts() {
      const r = await db.run(
        "DELETE FROM cvs WHERE status = 'draft' AND created_at < (UTC_TIMESTAMP(3) - INTERVAL 7 DAY) LIMIT 1000",
      );
      return r.affectedRows;
    },
  };
}

module.exports = { createCvsRepository };
