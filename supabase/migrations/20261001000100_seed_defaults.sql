-- Valors inicials decidits a PROPOSTA.md (editables després des de Configuració).

insert into user_zones (name, center, radius_km, sort_order) values
  ('Igualada',  extensions.st_setsrid(extensions.st_makepoint(1.6175, 41.5789), 4326)::extensions.geography, 30, 0),
  ('Barcelona', extensions.st_setsrid(extensions.st_makepoint(2.1686, 41.3874), 4326)::extensions.geography, 15, 1);

insert into user_prefs (id, category_weights, availability) values (
  1,
  '{"cultura": 0.5, "esport_natura": 0.5, "formacio_tech": 0.5, "gastronomia_social": 0.5}',
  '[
    {"days": [1, 2, 3, 4, 5], "from": "18:00", "to": "23:59", "weight": 1.0},
    {"days": [6, 7],          "from": "00:00", "to": "23:59", "weight": 1.0}
  ]'
);
