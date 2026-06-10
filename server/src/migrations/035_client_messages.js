// Лог сформированных сообщений клиенту (диплинк в личку + событие боту).
// Статус доставки не храним: канал ручной (диплинк), гарантировать доставку нельзя.
export async function up(knex) {
  await knex.schema.createTable('client_messages', (t) => {
    t.increments('id').primary()
    t.integer('order_id').references('orders.id').onDelete('CASCADE').notNullable()
    t.text('template')
    t.text('body').notNullable()
    t.text('public_token')
    t.integer('sent_by').references('users.id').onDelete('SET NULL').nullable()
    t.text('channels').notNullable().defaultTo('') // csv: copied,outbox
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.index(['order_id'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('client_messages')
}
