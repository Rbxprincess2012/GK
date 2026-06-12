// Онбординг доверенного лица в Telegram: личный chat_id появляется ПОСЛЕ того,
// как лицо открыло персональную ссылку /start p<code>. До привязки — pending.
// Авто-отправка отчёта лицу возможна только при tg_status='active' (chat_id известен).
// MAX-адрес остаётся ручным в trusted_persons.chats (бота у MAX пока нет).
export async function up(knex) {
  await knex.schema.alterTable('trusted_persons', (t) => {
    t.bigInteger('tg_chat_id').nullable()
    t.text('tg_status').nullable()                 // null | 'pending' | 'active' | 'revoked'
    t.text('tg_verify_code').nullable()
    t.timestamp('tg_verify_expires_at').nullable()
  })
}

export async function down(knex) {
  await knex.schema.alterTable('trusted_persons', (t) => {
    t.dropColumn('tg_chat_id')
    t.dropColumn('tg_status')
    t.dropColumn('tg_verify_code')
    t.dropColumn('tg_verify_expires_at')
  })
}
