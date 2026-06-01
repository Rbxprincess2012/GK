export async function up(knex) {
  await knex.schema.createTable('channels', (t) => {
    t.increments('id').primary()
    t.enu('owner_kind', ['client', 'driver']).notNullable()
    t.integer('owner_id').notNullable()
    t.enu('type', ['telegram', 'max', 'phone']).notNullable()
    t.text('external_id')
  })
  await knex.schema.createTable('inbound_messages', (t) => {
    t.increments('id').primary()
    t.integer('channel_id').references('channels.id').notNullable()
    t.text('raw_text'); t.text('media_url'); t.text('transcript')
    t.timestamp('received_at').defaultTo(knex.fn.now())
    t.integer('linked_order_id').references('orders.id').nullable()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('inbound_messages')
  await knex.schema.dropTableIfExists('channels')
}
