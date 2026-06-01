export async function up(knex) {
  await knex.schema.createTable('shifts', (t) => {
    t.increments('id').primary()
    t.integer('driver_id').references('drivers.id').notNullable()
    t.date('date').notNullable()
    t.enu('shift_type', ['day', 'night']).notNullable()
    t.enu('status', ['planned', 'present', 'sick', 'vacation', 'absent']).notNullable().defaultTo('planned')
    t.integer('vehicle_id').references('vehicles.id').nullable()
    t.text('note')
    t.unique(['driver_id', 'date', 'shift_type'])
  })
  await knex.schema.createTable('routes', (t) => {
    t.increments('id').primary()
    t.integer('driver_id').references('drivers.id').notNullable()
    t.integer('vehicle_id').references('vehicles.id').nullable()
    t.date('date').notNullable()
    t.enu('shift_type', ['day', 'night']).notNullable()
    t.unique(['driver_id', 'date', 'shift_type'])
  })
  await knex.schema.createTable('route_stops', (t) => {
    t.increments('id').primary()
    t.integer('route_id').references('routes.id').onDelete('CASCADE').notNullable()
    t.integer('seq').notNullable()
    t.enu('stop_type', ['object', 'landfill', 'base']).notNullable()
    t.integer('order_id').references('orders.id').nullable()
    t.integer('object_id').references('objects.id').nullable()
  })
  await knex.schema.createTable('invoices', (t) => {
    t.increments('id').primary()
    t.integer('client_id').references('clients.id').notNullable()
    t.integer('order_id').references('orders.id').nullable()
    t.decimal('amount', 12, 2)
    t.enu('status', ['issued', 'paid']).notNullable().defaultTo('issued')
    t.enu('method', ['cashless', 'cash']).nullable()
    t.timestamp('issued_at'); t.timestamp('paid_at')
  })
  await knex.schema.createTable('settings', (t) => {
    t.text('key').primary()
    t.jsonb('value').notNullable()
  })
}

export async function down(knex) {
  for (const tbl of ['route_stops', 'routes', 'shifts', 'invoices', 'settings'])
    await knex.schema.dropTableIfExists(tbl)
}
