-- Zengin şablonlar (yan sütun, ikonlar, zaman çizelgesi): katalogda en başta gösterilir.
UPDATE cv_templates SET sort_order = sort_order + 3;

INSERT INTO cv_templates (id, name, category, description, image, is_premium, sort_order) VALUES
  ('horizon', 'Horizon', 'Professional', 'Dark sidebar with photo, skill bars and timeline', 'assets/images/img_template_horizon.png', 1, 1),
  ('atelier', 'Atelier', 'Creative', 'Soft header band with photo and side panel', 'assets/images/img_template_atelier.png', 1, 2),
  ('prime', 'Prime', 'Modern', 'ATS-friendly single column with bold accents', 'assets/images/img_template_prime.png', 0, 3)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), category = VALUES(category), description = VALUES(description),
  image = VALUES(image), is_premium = VALUES(is_premium), sort_order = VALUES(sort_order), is_active = 1;
