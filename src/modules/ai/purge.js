'use strict';

// Hesap kalıcı silinirken CDN'deki portreler de silinir (veritabanı satırları cascade ile gider).
exports.onPurge = async (user, deps) => deps.ai.removeUserPortraits(user.id);
