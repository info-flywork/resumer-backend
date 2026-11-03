-- Resumer veritabanı (f2f Studio)
-- cPanel / hosting panelinden önce DB + user oluştur, user'ı DB'ye yetkilendir:
--   DB:   flywork1_resumer
--   User: flywork1_resumerUser  (şifre .env DB_PASSWORD ile aynı)
-- Sonra phpMyAdmin'de bu DB'yi seçip bu dosyayı import et (yalnızca tablolar).

USE `flywork1_resumer`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `ai_portraits`;
CREATE TABLE `ai_portraits` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'image/png',
  `image` mediumblob NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_ai_portraits_user` (`user_id`,`created_at`),
  CONSTRAINT `fk_ai_portraits_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `ai_portraits` DISABLE KEYS */;
/*!40000 ALTER TABLE `ai_portraits` ENABLE KEYS */;
DROP TABLE IF EXISTS `analyses`;
CREATE TABLE `analyses` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cv_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` enum('cv','linkedin') COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_label` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `overall_score` tinyint unsigned NOT NULL,
  `section_scores` json NOT NULL,
  `ats` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_analyses_user` (`user_id`,`created_at`),
  KEY `ix_analyses_cv` (`cv_id`),
  CONSTRAINT `fk_analyses_cv` FOREIGN KEY (`cv_id`) REFERENCES `cvs` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_analyses_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `analyses` DISABLE KEYS */;
/*!40000 ALTER TABLE `analyses` ENABLE KEYS */;
DROP TABLE IF EXISTS `analysis_recommendations`;
CREATE TABLE `analysis_recommendations` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `analysis_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` tinyint unsigned NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` enum('high','medium','low') COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_section` enum('summary','experience','education','skills','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `suggested_text` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `applied_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_analysis_rec_analysis` (`analysis_id`,`position`),
  KEY `ix_analysis_rec_user` (`user_id`),
  CONSTRAINT `fk_analysis_rec_analysis` FOREIGN KEY (`analysis_id`) REFERENCES `analyses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_analysis_rec_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `analysis_recommendations` DISABLE KEYS */;
/*!40000 ALTER TABLE `analysis_recommendations` ENABLE KEYS */;
DROP TABLE IF EXISTS `credit_ledger`;
CREATE TABLE `credit_ledger` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `delta` int NOT NULL,
  `reason` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ref_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `balance_after` int unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_credit_ledger_user` (`user_id`,`created_at`),
  CONSTRAINT `fk_credit_ledger_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `credit_ledger` DISABLE KEYS */;
/*!40000 ALTER TABLE `credit_ledger` ENABLE KEYS */;
DROP TABLE IF EXISTS `cv_templates`;
CREATE TABLE `cv_templates` (
  `id` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_premium` tinyint(1) NOT NULL DEFAULT '0',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_cv_templates_list` (`is_active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `cv_templates` DISABLE KEYS */;
INSERT INTO `cv_templates` VALUES ('classic','Classic','Professional','Timeless and structured','assets/images/img_template_modern.png',0,2,1,'2026-10-21 05:49:03.430'),('executive','Executive','Corporate','Formal and confident','assets/images/img_template_modern.png',1,3,1,'2026-10-21 05:49:03.430'),('modern','Modern','Modern','Clean and professional','assets/images/img_template_modern.png',0,1,1,'2026-10-21 05:49:03.430');
/*!40000 ALTER TABLE `cv_templates` ENABLE KEYS */;
DROP TABLE IF EXISTS `cvs`;
CREATE TABLE `cvs` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subtitle` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `template_id` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` json NOT NULL,
  `score` tinyint unsigned DEFAULT NULL,
  `is_tailored` tinyint(1) NOT NULL DEFAULT '0',
  `language` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_cv_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('saved','draft') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'saved',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_cvs_user_list` (`user_id`,`status`,`updated_at`),
  KEY `ix_cvs_status_created` (`status`,`created_at`),
  CONSTRAINT `fk_cvs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `cvs` DISABLE KEYS */;
/*!40000 ALTER TABLE `cvs` ENABLE KEYS */;
DROP TABLE IF EXISTS `entitlements`;
CREATE TABLE `entitlements` (
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entitlement` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `store` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expires_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`,`entitlement`),
  CONSTRAINT `fk_entitlements_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `entitlements` DISABLE KEYS */;
/*!40000 ALTER TABLE `entitlements` ENABLE KEYS */;
DROP TABLE IF EXISTS `faqs`;
CREATE TABLE `faqs` (
  `id` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locale` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'en',
  `question` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `answer` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `ix_faqs_list` (`locale`,`is_active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `faqs` DISABLE KEYS */;
INSERT INTO `faqs` VALUES ('faq_1','en','What is the Resumer?','Resumer is an AI-powered resume assistant. You can build a CV step by step, analyze it for ATS compatibility, tailor it to a job posting and translate it into other languages.',1,1),('faq_2','en','How it works?','Create a CV with the guided builder or pick an existing one, then use the AI tools. Each analysis, job tailoring or translation uses one AI credit; Resumer Pro members get monthly credits.',2,1),('faq_3','en','How do I upload my resume?','Build your CV in the app with Create a CV, or analyze a public LinkedIn profile link. Your CVs are saved to your account and available on all your devices.',3,1);
/*!40000 ALTER TABLE `faqs` ENABLE KEYS */;
DROP TABLE IF EXISTS `job_runs`;
CREATE TABLE `job_runs` (
  `name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_started_at` datetime(3) DEFAULT NULL,
  `last_finished_at` datetime(3) DEFAULT NULL,
  `last_error` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `job_runs` DISABLE KEYS */;
/*!40000 ALTER TABLE `job_runs` ENABLE KEYS */;
DROP TABLE IF EXISTS `purchases`;
CREATE TABLE `purchases` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `store_transaction_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `store` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `granted` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purchases_tx` (`store_transaction_id`),
  KEY `ix_purchases_user` (`user_id`),
  CONSTRAINT `fk_purchases_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `purchases` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchases` ENABLE KEYS */;
DROP TABLE IF EXISTS `push_outbox`;
CREATE TABLE `push_outbox` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `template` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `params` json DEFAULT NULL,
  `data` json DEFAULT NULL,
  `collapse_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','sent','failed','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT '0',
  `next_attempt_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sent_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_push_outbox_due` (`status`,`next_attempt_at`),
  KEY `fk_push_outbox_user` (`user_id`),
  CONSTRAINT `fk_push_outbox_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `push_outbox` DISABLE KEYS */;
/*!40000 ALTER TABLE `push_outbox` ENABLE KEYS */;
DROP TABLE IF EXISTS `revenuecat_events`;
CREATE TABLE `revenuecat_events` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `app_user_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `received_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `result` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `revenuecat_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `revenuecat_events` ENABLE KEYS */;
DROP TABLE IF EXISTS `schema_migrations`;
CREATE TABLE `schema_migrations` (
  `filename` varchar(191) NOT NULL,
  `checksum` char(16) NOT NULL,
  `applied_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*!40000 ALTER TABLE `schema_migrations` DISABLE KEYS */;
INSERT INTO `schema_migrations` VALUES ('001_core.sql','31a3759eb6daefa5','2026-10-21 05:49:03.425'),('100_content.sql','ec6e53c9f892ae55','2026-10-21 05:49:03.431'),('110_credits.sql','843b28023a16f767','2026-10-21 05:49:03.438'),('120_cvs.sql','700a15fc12b773db','2026-10-21 05:49:03.441'),('130_ai.sql','6464ee3af9d40f6e','2026-10-21 05:49:03.443'),('150_analyses.sql','4b7fc69740e54765','2026-10-21 05:49:03.453'),('160_tailor.sql','292d8dbfd50b34b9','2026-10-21 05:49:03.458'),('180_profile.sql','2fc1f23fde1d0870','2026-10-21 05:49:03.461'),('190_profile_collation.sql','1eb1e82d8f69c81a','2026-10-21 05:49:03.463');
/*!40000 ALTER TABLE `schema_migrations` ENABLE KEYS */;
DROP TABLE IF EXISTS `tailor_sessions`;
CREATE TABLE `tailor_sessions` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cv_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `job_url` varchar(2000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `job_title` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `company` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `current_score` tinyint unsigned NOT NULL,
  `suggestions` json NOT NULL,
  `applied_ids` json DEFAULT NULL,
  `applied_content` json DEFAULT NULL,
  `new_score` tinyint unsigned DEFAULT NULL,
  `status` enum('analyzed','applied','saved') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'analyzed',
  `saved_cv_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_tailor_user_created` (`user_id`,`created_at`),
  KEY `ix_tailor_created` (`created_at`),
  KEY `fk_tailor_cv` (`cv_id`),
  CONSTRAINT `fk_tailor_cv` FOREIGN KEY (`cv_id`) REFERENCES `cvs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tailor_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `tailor_sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `tailor_sessions` ENABLE KEYS */;
DROP TABLE IF EXISTS `user_profiles`;
CREATE TABLE `user_profiles` (
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `user_profiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_profiles` ENABLE KEYS */;
DROP TABLE IF EXISTS `user_wallets`;
CREATE TABLE `user_wallets` (
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `credits` int unsigned NOT NULL DEFAULT '0',
  `last_refill_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_wallets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `user_wallets` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_wallets` ENABLE KEYS */;
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `firebase_uid` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_verified` tinyint(1) NOT NULL DEFAULT '0',
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `auth_provider` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `locale` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tr',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `last_login_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `purge_after` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_firebase_uid` (`firebase_uid`),
  KEY `ix_users_purge` (`purge_after`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40000 ALTER TABLE `users` DISABLE KEYS */;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;

SET FOREIGN_KEY_CHECKS = 1;
