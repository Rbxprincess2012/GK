// Справедливое распределение: координаты объектов (источник/время геокодинга),
// сохранённые метрики нагрузки на заказе и настройка веса километража.
export async function up(knex) {
  await knex.schema.alterTable('objects', (t) => {
    t.timestamp('geocoded_at')      // когда геокодировали
    t.text('geo_source')            // yandex | manual | ... (manual не перезатираем)
  })
  await knex.schema.alterTable('orders', (t) => {
    t.decimal('distance_km', 8, 2)  // условный км от точки до базы (на момент назначения)
    t.integer('trips')              // число заездов (по слотам/вместимости)
    t.decimal('load_score', 8, 3)   // балл тяжести = trips + km_weight*km
  })
  // Дефолтная настройка распределения (вес километра в балле тяжести).
  await knex.raw(`INSERT INTO settings (key, value)
                  VALUES ('distribution', '{"km_weight":0.1}')
                  ON CONFLICT (key) DO NOTHING`)
}

export async function down(knex) {
  await knex.schema.alterTable('objects', (t) => {
    t.dropColumn('geocoded_at')
    t.dropColumn('geo_source')
  })
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('distance_km')
    t.dropColumn('trips')
    t.dropColumn('load_score')
  })
  await knex('settings').where({ key: 'distribution' }).del()
}
