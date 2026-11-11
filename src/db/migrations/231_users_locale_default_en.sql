-- Yeni kullanıcılar uygulama varsayılanı İngilizce ile başlar; dil seçince PATCH /account günceller.
ALTER TABLE users MODIFY locale VARCHAR(10) NOT NULL DEFAULT 'en';
