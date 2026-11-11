-- Zengin şablonlar 4. paket: önceki 18 zengin şablondan sonra, eski 20 şablondan önce.
UPDATE cv_templates SET sort_order = sort_order + 15 WHERE sort_order > 18;

INSERT INTO cv_templates (id, name, category, description, image, is_premium, sort_order) VALUES
  ('harbor', 'Harbor', 'Professional', 'Navy sidebar with slanted top and skill bars', 'assets/images/img_template_harbor.png', 1, 19),
  ('petal', 'Petal', 'Creative', 'Pastel background with rounded section cards', 'assets/images/img_template_petal.png', 1, 20),
  ('graphite', 'Graphite', 'Modern', 'Charcoal right sidebar with numbered sections', 'assets/images/img_template_graphite.png', 0, 21),
  ('dune', 'Dune', 'Creative', 'Wavy sand header with centered photo', 'assets/images/img_template_dune.png', 1, 22),
  ('monarch', 'Monarch', 'Professional', 'Classic serif name with ornamental dividers', 'assets/images/img_template_monarch.png', 0, 23),
  ('pixel', 'Pixel', 'Modern', 'Developer style terminal header and tech tags', 'assets/images/img_template_pixel.png', 1, 24),
  ('stripe', 'Stripe', 'Creative', 'Color stripe with vertical name', 'assets/images/img_template_stripe.png', 0, 25),
  ('glacier', 'Glacier', 'Corporate', 'Icy gradient header with framed photo', 'assets/images/img_template_glacier.png', 1, 26),
  ('orbit', 'Orbit', 'Modern', 'Ringed photo, icon badges and skill rings', 'assets/images/img_template_orbit.png', 1, 27),
  ('kraft', 'Kraft', 'Professional', 'Cream paper with boxed headings', 'assets/images/img_template_kraft.png', 0, 28),
  ('metro', 'Metro', 'Corporate', 'Bold full-width heading bars', 'assets/images/img_template_metro.png', 0, 29),
  ('ivory', 'Ivory', 'Professional', 'Luxury minimal with inset frame', 'assets/images/img_template_ivory.png', 1, 30),
  ('bloom', 'Bloom', 'Creative', 'Soft color blobs and pill tags', 'assets/images/img_template_bloom.png', 0, 31),
  ('compass', 'Compass', 'Modern', 'Full-height axis with dates on the left', 'assets/images/img_template_compass.png', 1, 32),
  ('noir', 'Noir', 'Corporate', 'Black monogram and bold typography', 'assets/images/img_template_noir.png', 0, 33)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), category = VALUES(category), description = VALUES(description),
  image = VALUES(image), is_premium = VALUES(is_premium), sort_order = VALUES(sort_order), is_active = 1;
