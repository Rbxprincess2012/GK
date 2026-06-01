INSERT INTO container_types (name) VALUES ('Стандартный (лодочка)') ON CONFLICT (name) DO NOTHING;
INSERT INTO settings (key, value) VALUES
  ('base',     '{"address":"","lat":null,"lng":null}'),
  ('landfill', '{"address":"","lat":null,"lng":null}'),
  ('fuel',     '{"tolerance":0.1}')
ON CONFLICT (key) DO NOTHING;
