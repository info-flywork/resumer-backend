'use strict';

/**
 * OneSignal REST — push gönderme ve hesap silmede kullanıcıyı silme.
 * Hedefleme external_id = users.id (istemci girişten sonra OneSignal.login(userId) çağırır).
 * @param {{ appId: string, restApiKey: string, fetch?: typeof fetch }} opts
 */
function createOneSignal({ appId, restApiKey, fetch: f = fetch }) {
  const enabled = Boolean(appId && restApiKey);
  const headers = { Authorization: `Key ${restApiKey}`, 'Content-Type': 'application/json' };

  return {
    enabled,
    /**
     * @param {{ userId: string, title: string, body: string, data?: Record<string, unknown> | null, collapseId?: string | null }} msg
     * @returns {Promise<{ delivered: boolean, reason?: string }>}
     */
    async send({ userId, title, body, data, collapseId }) {
      const payload = {
        app_id: appId,
        target_channel: 'push',
        include_aliases: { external_id: [userId] },
        headings: { en: title },
        contents: { en: body },
        ...(data ? { data } : {}),
        ...(collapseId ? { collapse_id: collapseId } : {}),
      };
      const r = await f('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const json = /** @type {any} */ (await r.json().catch(() => ({})));
      if (!r.ok) {
        const err = new Error(`OneSignal ${r.status}`);
        /** @type {any} */ (err).retryable = r.status >= 500 || r.status === 429;
        throw err;
      }
      // 200 + errors / 0 alıcı: kullanıcının cihazı kayıtlı değil (tekrar denemenin anlamı yok)
      if (json.errors || !json.id) return { delivered: false, reason: 'no_subscription' };
      return { delivered: true };
    },
    /** @param {string} userId */
    async deleteUser(userId) {
      const r = await f(`https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok && r.status !== 404) throw new Error(`OneSignal delete ${r.status}`);
    },
  };
}

module.exports = { createOneSignal };
