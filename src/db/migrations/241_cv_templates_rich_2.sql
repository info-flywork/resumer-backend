-- Zengin şablonlar 2. paket: Horizon / Atelier / Prime'dan sonra, eski 20 şablondan önce.
UPDATE cv_templates SET sort_order = sort_order + 6 WHERE sort_order > 3;

INSERT INTO cv_templates (id, name, category, description, image, is_premium, sort_order) VALUES
  ('onyx', 'Onyx', 'Corporate', 'Charcoal header band with gold accents', 'assets/images/img_template_onyx.png', 1, 4),
  ('verdant', 'Verdant', 'Creative', 'Deep green sidebar with pill headings', 'assets/images/img_template_verdant.png', 1, 5),
  ('lumen', 'Lumen', 'Professional', 'Elegant serif name and fine double rules', 'assets/images/img_template_lumen.png', 0, 6),
  ('cobalt', 'Cobalt', 'Modern', 'Geometric corner block and date column', 'assets/images/img_template_cobalt.png', 0, 7),
  ('ember', 'Ember', 'Creative', 'Warm tones, bold name and language dots', 'assets/images/img_template_ember.png', 1, 8),
  ('nova', 'Nova', 'Modern', 'Right sidebar with icon headings and skill bars', 'assets/images/img_template_nova.png', 0, 9)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), category = VALUES(category), description = VALUES(description),
  image = VALUES(image), is_premium = VALUES(is_premium), sort_order = VALUES(sort_order), is_active = 1;
