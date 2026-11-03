-- Çekirdek tablolar (şablon). Uygulamaya özgü tablolar 100_ ve sonrası numaralarla eklenir.
-- Kural: uygulanmış migration dosyası asla değiştirilmez; düzeltme yeni bir dosyayla yapılır.

CREATE TABLE users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  firebase_uid VARCHAR(128) NOT NULL,
  email VARCHAR(255) NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  phone VARCHAR(32) NULL,
  display_name VARCHAR(100) NULL,
  photo_url VARCHAR(1000) NULL,
  auth_provider VARCHAR(32) NOT NULL DEFAULT 'unknown',
  locale VARCHAR(10) NOT NULL DEFAULT 'tr',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  purge_after DATETIME(3) NULL,
  UNIQUE KEY uq_users_firebase_uid (firebase_uid),
  KEY ix_users_purge (purge_after)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RevenueCat aboneliklerinin sunucudaki kopyası (premium kilidi bunu okur)
CREATE TABLE entitlements (
  user_id CHAR(36) NOT NULL,
  entitlement VARCHAR(64) NOT NULL,
  product_id VARCHAR(191) NULL,
  store VARCHAR(32) NULL,
  expires_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, entitlement),
  CONSTRAINT fk_entitlements_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Webhook olayları: aynı olay iki kez işlenmez
CREATE TABLE revenuecat_events (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  type VARCHAR(64) NOT NULL,
  app_user_id VARCHAR(191) NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  result VARCHAR(64) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tüketilebilir satın alımlar (coin / kredi paketleri): her mağaza işlemi bir kez
CREATE TABLE purchases (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  product_id VARCHAR(191) NOT NULL,
  store_transaction_id VARCHAR(191) NOT NULL,
  store VARCHAR(32) NULL,
  granted JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_purchases_tx (store_transaction_id),
  KEY ix_purchases_user (user_id),
  CONSTRAINT fk_purchases_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Push bildirim kuyruğu: istek içinde gönderilmez, worker gönderir ve yeniden dener
CREATE TABLE push_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  template VARCHAR(64) NOT NULL,
  params JSON NULL,
  data JSON NULL,
  collapse_id VARCHAR(64) NULL,
  status ENUM('pending', 'sent', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_error VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at DATETIME(3) NULL,
  KEY ix_push_outbox_due (status, next_attempt_at),
  CONSTRAINT fk_push_outbox_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Zamanlanmış işlerin son çalışması (worker)
CREATE TABLE job_runs (
  name VARCHAR(64) NOT NULL PRIMARY KEY,
  last_started_at DATETIME(3) NULL,
  last_finished_at DATETIME(3) NULL,
  last_error VARCHAR(1000) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
