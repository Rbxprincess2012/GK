// Сколько ПУСТЫХ контейнеров машина увозит на объект за один рейс (вставляются
// друг в друга, «лего»). По умолчанию 2. Полный контейнер всегда едет один —
// это правило физическое и не настраивается. Заезды считаются как
//   max(ceil(пустые / empty_capacity), полные).
export async function up(knex) {
  await knex.schema.alterTable('vehicles', (t) => {
    t.integer('empty_capacity').notNullable().defaultTo(2)
  })
}

export async function down(knex) {
  await knex.schema.alterTable('vehicles', (t) => {
    t.dropColumn('empty_capacity')
  })
}
