// Приглашение по ссылке: директор задаёт только почту, сотрудник сам ставит
// пароль по одноразовому токену из письма. До активации пароля нет.
export async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.text('invite_token').unique()
    t.timestamp('invite_expires')
  })
  // Пароль теперь необязателен (до активации сотрудником его нет).
  await knex.schema.alterTable('users', (t) => {
    t.text('password_hash').nullable().alter()
  })
}

export async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('invite_token')
    t.dropColumn('invite_expires')
  })
  // Откат nullable не делаем — иначе сломаются строки без пароля.
}
