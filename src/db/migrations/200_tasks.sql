-- Uzun işler (yapay zekâ): istemci `Prefer: respond-async` gönderirse uç 202 { task_id } döner,
-- iş arka planda çalışır; GET /jobs/:id durumu / sonucu verir. Başlıksız (eski sürüm) istekler eskisi gibi bekler.
CREATE TABLE tasks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  kind VARCHAR(64) NOT NULL,
  status ENUM('queued', 'running', 'done', 'failed') NOT NULL DEFAULT 'queued',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  eta_s INT NULL,
  input JSON NULL,
  result JSON NULL,
  error_status SMALLINT NULL,
  error_code VARCHAR(64) NULL,
  error VARCHAR(500) NULL,
  error_details JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_tasks_user (user_id, created_at),
  KEY ix_tasks_cleanup (status, updated_at),
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
