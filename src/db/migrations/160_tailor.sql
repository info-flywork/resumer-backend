-- tailor modülü (blok 160). Oturum kullanıcıya bağlı; CV silinince / hesap silinince cascade.
-- saved_cv_id için FK yok: kaydedilen CV sonradan silinebilir.
CREATE TABLE tailor_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  cv_id CHAR(36) NOT NULL,
  job_url VARCHAR(2000) NOT NULL,
  job_title VARCHAR(160) NOT NULL,
  company VARCHAR(160) NOT NULL DEFAULT '',
  current_score TINYINT UNSIGNED NOT NULL,
  suggestions JSON NOT NULL,
  applied_ids JSON NULL,
  applied_content JSON NULL,
  new_score TINYINT UNSIGNED NULL,
  status ENUM('analyzed','applied','saved') NOT NULL DEFAULT 'analyzed',
  saved_cv_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_tailor_user_created (user_id, created_at),
  KEY ix_tailor_created (created_at),
  CONSTRAINT fk_tailor_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_tailor_cv FOREIGN KEY (cv_id) REFERENCES cvs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
