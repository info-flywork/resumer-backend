-- credits modülü (blok 110): AI kredi cüzdanı ve kredi hareketleri. Kullanıcı silinince cascade ile temizlenir.
CREATE TABLE user_wallets (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  credits INT UNSIGNED NOT NULL DEFAULT 0,
  last_refill_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_user_wallets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE credit_ledger (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(32) NOT NULL, -- welcome | monthly_refill | purchase | analysis | tailor | translation | portrait | refund
  ref_id VARCHAR(64) NULL,
  balance_after INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_credit_ledger_user (user_id, created_at),
  CONSTRAINT fk_credit_ledger_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
