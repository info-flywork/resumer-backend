-- content modülü (blok 100): herkese ortak sabit içerik (kullanıcıya bağlı değil). Tohum verisi aşağıda.
CREATE TABLE cv_templates (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  category VARCHAR(60) NOT NULL,
  description VARCHAR(160) NOT NULL,
  image VARCHAR(255) NOT NULL,
  is_premium TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_cv_templates_list (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE faqs (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  locale VARCHAR(10) NOT NULL DEFAULT 'en',
  question VARCHAR(255) NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  KEY ix_faqs_list (locale, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO cv_templates (id, name, category, description, image, is_premium, sort_order) VALUES
  ('modern', 'Modern', 'Modern', 'Clean and professional', 'assets/images/img_template_modern.png', 0, 1),
  ('classic', 'Classic', 'Professional', 'Timeless and structured', 'assets/images/img_template_modern.png', 0, 2),
  ('executive', 'Executive', 'Corporate', 'Formal and confident', 'assets/images/img_template_modern.png', 1, 3);

INSERT INTO faqs (id, locale, question, answer, sort_order) VALUES
  ('faq_1', 'en', 'What is the Resumer?', 'Resumer is an AI-powered resume assistant. You can build a CV step by step, analyze it for ATS compatibility, tailor it to a job posting and translate it into other languages.', 1),
  ('faq_2', 'en', 'How it works?', 'Create a CV with the guided builder or pick an existing one, then use the AI tools. Each analysis, job tailoring or translation uses one AI credit; Resumer Pro members get monthly credits.', 2),
  ('faq_3', 'en', 'How do I upload my resume?', 'Build your CV in the app with Create a CV, or analyze a public LinkedIn profile link. Your CVs are saved to your account and available on all your devices.', 3);
