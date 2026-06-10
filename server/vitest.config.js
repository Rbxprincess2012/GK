import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Тесты ходят в отдельную схему dispatcher_test (та же БД Timeweb), не трогая public.
    env: { NODE_ENV: 'test', PGSCHEMA: 'dispatcher_test' },
    globalSetup: ['./test/global-setup.js'],
    // общая физическая схема → файлы тестов не гоняем параллельно (иначе гонки TRUNCATE)
    fileParallelism: false,
    // Интеграционные тесты ходят в УДАЛЁННУЮ БД (Timeweb) через весь Express-стек —
    // по нескольку round-trip'ов на тест. Дефолтные 5с тесны и флапают на латентности.
    testTimeout: 20000,
  },
})
