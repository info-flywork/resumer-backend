-- ai modülü (blok 130): AI portre görselleri. Kullanıcı silinince cascade ile temizlenir.
CREATE TABLE ai_portraits (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  mime VARCHAR(32) NOT NULL DEFAULT 'image/png',
  image MEDIUMBLOB NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_ai_portraits_user (user_id, created_at),
  CONSTRAINT fk_ai_portraits_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
