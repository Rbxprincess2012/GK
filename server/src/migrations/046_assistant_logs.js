// Лог вопросов/ответов ИИ-ассистента саппорта. Источник для роста базы знаний и контроля
// качества (видно, что людям непонятно / где баги). user_id БЕЗ FK: тест-байпас даёт user.id=0,
// которого нет в users — FK бы упал; чистка/ретеншн (ПД) — позже.
export async function up(knex) {
  await knex.schema.createTable('assistant_logs', (t) => {
    t.increments('id').primary()
    t.integer('user_id').nullable()
    t.text('question').notNullable()
    t.text('answer')
    t.boolean('ok').notNullable().defaultTo(true)        // модель ответила без ошибки
    t.boolean('escalated').notNullable().defaultTo(false) // ответ-«не знаю» → эскалация
    t.integer('tokens').nullable()
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.index('created_at')
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('assistant_logs')
}
