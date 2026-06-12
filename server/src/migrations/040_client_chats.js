// Адреса общих чатов клиента по мессенджерам (Telegram / MAX) — ручной ввод менеджера.
// { telegram: '<ссылка на группу/чат>', max: '<ссылка>' }. Куда слать отчёты «в общий чат».
// Дополняет client_recipients (онбординг бота); это — ручные ссылки на уровне клиента.
export async function up(knex) {
  if (!(await knex.schema.hasColumn('clients', 'chats'))) {
    await knex.schema.alterTable('clients', (t) => {
      t.jsonb('chats').notNullable().defaultTo('{}')
    })
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('clients', 'chats')) {
    await knex.schema.alterTable('clients', (t) => t.dropColumn('chats'))
  }
}
