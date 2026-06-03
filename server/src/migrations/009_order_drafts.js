export async function up(knex) {
  // Чёрновики заявок от ботов (Этап 2). В отличие от orders — БЕЗ жёсткого FK на объект и
  // без структурных позиций: сюда падает сырой запрос клиента (текст/голос) + нормализованный
  // task_text для водителя. Диспетчер разбирает «Входящие», матчит объект, проставляет
  // позиции и promote → создаётся настоящая orders-заявка.
  await knex.schema.createTable('order_drafts', (t) => {
    t.increments('id').primary()
    t.integer('channel_id').references('channels.id').notNullable()
    t.integer('client_id').references('clients.id').nullable()   // выводится из канала
    t.integer('object_id').references('objects.id').nullable()   // если резолв однозначен
    t.text('object_hint')                                        // сырой адрес/подсказка от LLM
    t.date('desired_date')
    t.text('desired_time')
    t.text('task_text').notNullable()                            // деловая формулировка для водителя
    t.text('raw_message')                                        // исходное сообщение клиента
    t.text('transcript')                                         // STT, если голос
    t.enu('source_kind', ['text', 'voice']).notNullable().defaultTo('text')
    t.enu('status', ['need_review', 'promoted', 'rejected']).notNullable().defaultTo('need_review')
    t.text('reject_reason')
    t.integer('promoted_order_id').references('orders.id').nullable()
    t.jsonb('ambiguities').notNullable().defaultTo('[]')         // что просить уточнить у клиента
    t.jsonb('llm_extraction')                                    // исходная выдача ИИ — сигнал для петли обучения (см. docs/ai-order-extraction.md)
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())
    t.index(['status'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('order_drafts')
}
