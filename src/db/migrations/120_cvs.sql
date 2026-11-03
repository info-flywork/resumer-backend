-- cvs modülü (blok 120). CV içeriği JSON (CvDraft şekli). source_cv_id için FK yok: kaynak CV silinebilir.
CREATE TABLE cvs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  subtitle VARCHAR(120) NOT NULL DEFAULT '',
  template_id VARCHAR(40) NULL,
  content JSON NOT NULL,
  score TINYINT UNSIGNED NULL,
  is_tailored TINYINT(1) NOT NULL DEFAULT 0,
  language VARCHAR(10) NULL,
  source_cv_id CHAR(36) NULL,
  status ENUM('saved','draft') NOT NULL DEFAULT 'saved',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_cvs_user_list (user_id, status, updated_at),
  KEY ix_cvs_status_created (status, created_at),
  CONSTRAINT fk_cvs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
