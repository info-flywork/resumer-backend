-- Distinct preview assets + expand catalog so every filter category has templates.
UPDATE cv_templates
  SET description = 'Clean and contemporary',
      image = 'assets/images/img_template_modern.png',
      sort_order = 1
  WHERE id = 'modern';

UPDATE cv_templates
  SET description = 'Timeless and structured',
      image = 'assets/images/img_template_classic.png',
      sort_order = 3
  WHERE id = 'classic';

UPDATE cv_templates
  SET description = 'Formal and confident',
      image = 'assets/images/img_template_executive.png',
      sort_order = 5
  WHERE id = 'executive';

INSERT INTO cv_templates (id, name, category, description, image, is_premium, sort_order) VALUES
  ('aurora', 'Aurora', 'Modern', 'Two-column with accent sidebar', 'assets/images/img_template_aurora.png', 0, 2),
  ('elegant', 'Elegant', 'Professional', 'Refined with subtle accent', 'assets/images/img_template_elegant.png', 0, 4),
  ('creative', 'Creative', 'Creative', 'Bold and distinctive', 'assets/images/img_template_creative.png', 0, 6)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  description = VALUES(description),
  image = VALUES(image),
  is_premium = VALUES(is_premium),
  sort_order = VALUES(sort_order),
  is_active = 1;
