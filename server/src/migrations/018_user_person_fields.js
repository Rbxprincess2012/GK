// Директор и менеджер — такие же физлица, как водители/доверенные: им нужны
// мессенджеры (Telegram/MAX, можно оба), должность и аватар.
// phone в таблице users уже есть (миграция 008).
export async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.specificType('messengers', 'text[]').notNullable().defaultTo('{}')
    t.text('position')   // должность / заметка
    t.text('avatar')     // data-URL (base64) — храним прямо в колонке
  })
}

export async function down(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('messengers')
    t.dropColumn('position')
    t.dropColumn('avatar')
  })
}
