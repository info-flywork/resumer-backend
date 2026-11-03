-- profile modülü (blok 180). Satır yoksa varsayılanlar kullanılır; kullanıcı silinince satır da gider.
CREATE TABLE user_profiles (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NULL,
  title VARCHAR(100) NULL,
  phone VARCHAR(32) NULL,
  location VARCHAR(120) NULL,
  description VARCHAR(1000) NULL,
  avatar_url VARCHAR(1000) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
