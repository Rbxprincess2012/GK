// Получатели отчётов на уровне клиента (Telegram): личные чаты и группы заказчика.
// chat_id появляется ПОСЛЕ онбординга бота (личная ссылка /start <code> или /bind <code>
// в группе). Заменяет временное одиночное поле clients.telegram_chat.
export async function up(knex) {
  await knex.schema.createTable('client_recipients', (t) => {
    t.increments('id').primary()
    t.integer('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE')
    t.text('kind').notNullable()                         // 'dm' | 'group'
    t.bigInteger('chat_id').nullable()
    t.text('title').nullable()
    t.text('status').notNullable().defaultTo('pending')  // pending | active | revoked
    t.text('verify_code').nullable()
    t.timestamp('verify_expires_at').nullable()
    t.timestamp('last_sent_at').nullable()
    t.timestamps(true, true)
    t.index(['client_id', 'status'])
    t.unique(['chat_id'])   // несколько NULL допустимы в Postgres → pending-строки не конфликтуют
  })
  if (await knex.schema.hasColumn('clients', 'telegram_chat')) {
    await knex.schema.alterTable('clients', (t) => t.dropColumn('telegram_chat'))
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('client_recipients')
  if (!(await knex.schema.hasColumn('clients', 'telegram_chat'))) {
    await knex.schema.alterTable('clients', (t) => t.text('telegram_chat').nullable())
  }
}
