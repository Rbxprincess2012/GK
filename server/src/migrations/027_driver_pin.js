// PIN водителя для повторного входа в бот (после «Выйти»/смены устройства).
// Первичная привязка — по одноразовой ссылке (channels.verifyCode). PIN — второй фактор.
// scrypt-хеш (формат как у users), + брут-защита (попытки/блокировка).
export async function up(knex) {
  await knex.schema.alterTable('drivers', (t) => {
    t.text('pin_hash')
    t.integer('pin_attempts').notNullable().defaultTo(0)
    t.timestamp('pin_locked_until')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('drivers', (t) => {
    t.dropColumn('pin_hash')
    t.dropColumn('pin_attempts')
    t.dropColumn('pin_locked_until')
  })
}
