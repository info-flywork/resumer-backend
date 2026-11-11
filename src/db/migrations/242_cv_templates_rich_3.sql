-- Zengin şablonlar 3. paket: önceki 9 zengin şablondan sonra, eski 20 şablondan önce.
UPDATE cv_templates SET sort_order = sort_order + 9 WHERE sort_order > 9;

INSERT INTO cv_templates (id, name, category, description, image, is_premium, sort_order) VALUES
  ('sable', 'Sable', 'Creative', 'Warm beige panel with dot ratings', 'assets/images/img_template_sable.png', 1, 10),
  ('linea', 'Linea', 'Professional', 'Minimal black and white with date column', 'assets/images/img_template_linea.png', 0, 11),
  ('tabula', 'Tabula', 'Corporate', 'Grey sidebar with dark tab headings', 'assets/images/img_template_tabula.png', 1, 12),
  ('apex', 'Apex', 'Corporate', 'Dark header band with photo and side rules', 'assets/images/img_template_apex.png', 0, 13),
  ('crimson', 'Crimson', 'Creative', 'Burgundy header block with overlapping photo', 'assets/images/img_template_crimson.png', 1, 14),
  ('midnight', 'Midnight', 'Modern', 'Full dark page with mint accents', 'assets/images/img_template_midnight.png', 1, 15),
  ('vertex', 'Vertex', 'Creative', 'Photo sidebar with vertical section labels', 'assets/images/img_template_vertex.png', 1, 16),
  ('amber', 'Amber', 'Modern', 'Dark sidebar with offset yellow photo frame', 'assets/images/img_template_amber.png', 0, 17),
  ('azure', 'Azure', 'Professional', 'Blue contact band with skill rings', 'assets/images/img_template_azure.png', 0, 18)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), category = VALUES(category), description = VALUES(description),
  image = VALUES(image), is_premium = VALUES(is_premium), sort_order = VALUES(sort_order), is_active = 1;
