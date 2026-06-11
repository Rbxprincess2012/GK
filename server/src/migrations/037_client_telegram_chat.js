// Адрес Telegram-чата на уровне клиента: куда отправлять сообщения/фотоотчёты —
// в личку доверенного лица или в группу заказчика. Хранится как ссылка/@username/t.me-URL;
// менеджер открывает её из модалки «Сообщить клиенту».
export async function up(knex) {
  const has = await knex.schema.hasColumn('clients', 'telegram_chat')
  if (!has) await knex.schema.alterTable('clients', (t) => t.text('telegram_chat').nullable())
}

export async function down(knex) {
  const has = await knex.schema.hasColumn('clients', 'telegram_chat')
  if (has) await knex.schema.alterTable('clients', (t) => t.dropColumn('telegram_chat'))
}
