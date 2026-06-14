// MAX-каналы (второй мессенджер рядом с Telegram) + namespace сессий по каналу.
//  • trusted_persons: max_* (зеркало tg_* из 041) — личный онбординг лица в MAX.
//  • client_recipients: channel ('telegram'|'max'); unique по (channel, chat_id), т.к. числовые
//    chat_id Telegram и MAX живут в разных пространствах и могут пересечься.
//  • bot_sessions: channel + составной PK (channel, chat_id) — MAX-сессия водителя не должна
//    затирать его же Telegram-сессию с тем же числовым chat_id.
export async function up(knex) {
  await knex.schema.alterTable('trusted_persons', (t) => {
    t.bigInteger('max_chat_id').nullable()
    t.text('max_status').nullable()                // null | 'pending' | 'active' | 'revoked'
    t.text('max_verify_code').nullable()
    t.timestamp('max_verify_expires_at').nullable()
  })

  await knex.schema.alterTable('client_recipients', (t) => {
    t.text('channel').notNullable().defaultTo('telegram')   // 'telegram' | 'max'
  })
  // Заменяем unique(chat_id) → unique(channel, chat_id). Старый именованный constraint снимаем явно.
  await knex.schema.alterTable('client_recipients', (t) => {
    t.dropUnique(['chat_id'])
    t.unique(['channel', 'chat_id'])
  })

  await knex.schema.alterTable('bot_sessions', (t) => {
    t.text('channel').notNullable().defaultTo('telegram')   // 'telegram' | 'max'
  })
  // PK chat_id → (channel, chat_id). Иначе onConflict(['channel','chat_id']) не найдёт arbiter.
  await knex.schema.alterTable('bot_sessions', (t) => {
    t.dropPrimary()
    t.primary(['channel', 'chat_id'])
  })
}

export async function down(knex) {
  await knex.schema.alterTable('bot_sessions', (t) => {
    t.dropPrimary()
    t.primary(['chat_id'])
  })
  await knex.schema.alterTable('bot_sessions', (t) => t.dropColumn('channel'))

  await knex.schema.alterTable('client_recipients', (t) => {
    t.dropUnique(['channel', 'chat_id'])
    t.unique(['chat_id'])
  })
  await knex.schema.alterTable('client_recipients', (t) => t.dropColumn('channel'))

  await knex.schema.alterTable('trusted_persons', (t) => {
    t.dropColumn('max_chat_id')
    t.dropColumn('max_status')
    t.dropColumn('max_verify_code')
    t.dropColumn('max_verify_expires_at')
  })
}
