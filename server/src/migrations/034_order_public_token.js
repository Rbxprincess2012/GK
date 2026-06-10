// Публичный бессрочный токен фотоотчёта по заявке (страница /r/:token без авторизации).
// Заполняется один раз при первой приёмке заявки менеджером.
export async function up(knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.text('public_token').unique().nullable()
  })
}

export async function down(knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('public_token')
  })
}
