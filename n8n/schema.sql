-- Схема под заказы. Items хранятся как JSONB (точки сбора).
-- Соответствует модели из CLAUDE.md: order -> items[] -> { client_id, address_id, action, waste_class, container_count, ... }

CREATE TABLE IF NOT EXISTS orders (
  id          BIGSERIAL PRIMARY KEY,
  number      INT GENERATED ALWAYS AS IDENTITY,   -- человекочитаемый номер заявки
  client_id   BIGINT,                             -- дубль client_id первой точки (для фильтров), может быть NULL
  driver_id   BIGINT,
  status      TEXT        NOT NULL DEFAULT 'new',  -- new | assigned | in_transit | completed | cancelled
  items       JSONB       NOT NULL DEFAULT '[]',
  note        TEXT,                                -- общее примечание к заявке
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_status_idx     ON orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at);

-- пара примеров, чтобы GET /orders сразу что-то вернул
INSERT INTO orders (client_id, status, items, note) VALUES
  (1, 'new',      '[{"client_id":"1","address_id":"1","action":"take","waste_class":"4","container_count":1}]', NULL),
  (2, 'assigned', '[{"client_id":"2","address_id":"3","action":"replace","waste_class":"5","container_count":2}]', 'Позвонить за час');
