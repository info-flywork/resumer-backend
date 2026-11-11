-- Expand catalog to 20 distinct modern templates (every filter category covered).
UPDATE cv_templates
  SET name = 'Modern',
      category = 'Modern',
      description = 'Clean single-column with accent bar',
      image = 'assets/images/img_template_modern.png',
      is_premium = 0,
      sort_order = 1,
      is_active = 1
  WHERE id = 'modern';

UPDATE cv_templates
  SET name = 'Aurora',
      category = 'Modern',
      description = 'Two-column with accent sidebar',
      image = 'assets/images/img_template_aurora.png',
      is_premium = 0,
      sort_order = 2,
      is_active = 1
  WHERE id = 'aurora';

UPDATE cv_templates
  SET name = 'Classic',
      category = 'Professional',
      description = 'Centered timeless structure',
      image = 'assets/images/img_template_classic.png',
      is_premium = 0,
      sort_order = 7,
      is_active = 1
  WHERE id = 'classic';

UPDATE cv_templates
  SET name = 'Elegant',
      category = 'Professional',
      description = 'Refined teal accent details',
      image = 'assets/images/img_template_elegant.png',
      is_premium = 0,
      sort_order = 8,
      is_active = 1
  WHERE id = 'elegant';

UPDATE cv_templates
  SET name = 'Executive',
      category = 'Corporate',
      description = 'Formal dark header banner',
      image = 'assets/images/img_template_executive.png',
      is_premium = 1,
      sort_order = 12,
      is_active = 1
  WHERE id = 'executive';

UPDATE cv_templates
  SET name = 'Creative',
      category = 'Creative',
      description = 'Bold coral block and chips',
      image = 'assets/images/img_template_creative.png',
      is_premium = 0,
      sort_order = 17,
      is_active = 1
  WHERE id = 'creative';

INSERT INTO cv_templates (id, name, category, description, image, is_premium, sort_order) VALUES
  ('nexus', 'Nexus', 'Modern', 'Bold header band with skill chips', 'assets/images/img_template_nexus.png', 0, 3),
  ('slate', 'Slate', 'Modern', 'Muted tones with thin side rail', 'assets/images/img_template_slate.png', 0, 4),
  ('mono', 'Mono', 'Modern', 'Ultra-minimal black and white', 'assets/images/img_template_mono.png', 0, 5),
  ('pulse', 'Pulse', 'Modern', 'Large type with accent underlines', 'assets/images/img_template_pulse.png', 0, 6),
  ('atlas', 'Atlas', 'Professional', 'Balanced equal two-column split', 'assets/images/img_template_atlas.png', 0, 9),
  ('meridian', 'Meridian', 'Professional', 'Left labels with content rail', 'assets/images/img_template_meridian.png', 0, 10),
  ('folio', 'Folio', 'Professional', 'Double-rule editorial layout', 'assets/images/img_template_folio.png', 0, 11),
  ('summit', 'Summit', 'Corporate', 'Navy header with gold accents', 'assets/images/img_template_summit.png', 1, 13),
  ('ledger', 'Ledger', 'Corporate', 'Dense rows with aligned dates', 'assets/images/img_template_ledger.png', 0, 14),
  ('boardroom', 'Boardroom', 'Corporate', 'Right sidebar corporate panel', 'assets/images/img_template_boardroom.png', 1, 15),
  ('capital', 'Capital', 'Corporate', 'Heavy rules, structured sections', 'assets/images/img_template_capital.png', 0, 16),
  ('vivid', 'Vivid', 'Creative', 'Asymmetric purple header cards', 'assets/images/img_template_vivid.png', 0, 18),
  ('studio', 'Studio', 'Creative', 'Portrait circle with bold accent', 'assets/images/img_template_studio.png', 0, 19),
  ('prism', 'Prism', 'Creative', 'Magenta card grid composition', 'assets/images/img_template_prism.png', 1, 20)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  description = VALUES(description),
  image = VALUES(image),
  is_premium = VALUES(is_premium),
  sort_order = VALUES(sort_order),
  is_active = 1;
