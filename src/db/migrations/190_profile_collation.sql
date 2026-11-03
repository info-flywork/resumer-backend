-- user_profiles (180) karakter düzenini açıkça belirtmiyordu: veritabanı varsayılanı utf8mb4_unicode_ci değilse
-- users.id ile yabancı anahtar uyuşmaz. Uygulanmış migration değiştirilmez → tabloyu açıkça çevir.
-- Panelin database.sql'iyle kurulan veritabanında zaten bu düzende; değişiklik yapmaz (küçük tablo, kısa sürer).
ALTER TABLE user_profiles CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
