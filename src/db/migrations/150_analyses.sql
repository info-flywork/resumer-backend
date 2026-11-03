-- analyses modülü (blok 150). cv_id: CV silinirse analiz kalır (SET NULL); kullanıcı silinirse hepsi gider.
CREATE TABLE analyses (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  cv_id CHAR(36) NULL,
  source ENUM('cv','linkedin') NOT NULL,
  source_label VARCHAR(255) NULL,
  overall_score TINYINT UNSIGNED NOT NULL,
  section_scores JSON NOT NULL,
  ats JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_analyses_user (user_id, created_at),
  KEY ix_analyses_cv (cv_id),
  CONSTRAINT fk_analyses_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_analyses_cv FOREIGN KEY (cv_id) REFERENCES cvs (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analysis_recommendations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  analysis_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  priority ENUM('high','medium','low') NOT NULL,
  target_section ENUM('summary','experience','education','skills','other') NOT NULL DEFAULT 'other',
  suggested_text VARCHAR(2000) NULL,
  applied_at DATETIME(3) NULL,
  KEY ix_analysis_rec_analysis (analysis_id, position),
  KEY ix_analysis_rec_user (user_id),
  CONSTRAINT fk_analysis_rec_analysis FOREIGN KEY (analysis_id) REFERENCES analyses (id) ON DELETE CASCADE,
  CONSTRAINT fk_analysis_rec_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
