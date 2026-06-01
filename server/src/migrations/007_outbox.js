export async function up(knex) {
  // Исходящие события для n8n (надёжная доставка через поллинг/ack, не fire-and-forget).
  await knex.schema.createTable('outbox', (t) => {
    t.increments('id').primary()
    t.text('event_type').notNullable() // order_accepted | order_assigned | order_done | order_failed
    t.integer('order_id').references('orders.id').nullable()
    t.jsonb('payload').notNullable().defaultTo('{}')
    t.text('event_key').notNullable().unique() // идемпотентность: повтор не плодит дубль
    t.enu('status', ['pending', 'sent']).notNullable().defaultTo('pending')
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('delivered_at')
    t.index(['status'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('outbox')
}
