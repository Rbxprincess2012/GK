// Доверенное лицо может иметь несколько способов связи (Telegram и/или MAX).
// Заменяем одиночный messenger на массив messengers text[].
// (drivers.messenger оставляем как есть — там по-прежнему один.)
export async function up(knex) {
  await knex.schema.alterTable('trusted_persons', (t) => {
    t.specificType('messengers', 'text[]').notNullable().defaultTo('{}')
  })
  await knex.raw(`UPDATE trusted_persons
                  SET messengers = ARRAY[messenger]::text[]
                  WHERE messenger IS NOT NULL AND messenger <> ''`)
  await knex.schema.alterTable('trusted_persons', (t) => {
    t.dropColumn('messenger')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('trusted_persons', (t) => {
    t.text('messenger')
  })
  await knex.raw(`UPDATE trusted_persons
                  SET messenger = messengers[1]
                  WHERE array_length(messengers, 1) >= 1`)
  await knex.schema.alterTable('trusted_persons', (t) => {
    t.dropColumn('messengers')
  })
}
