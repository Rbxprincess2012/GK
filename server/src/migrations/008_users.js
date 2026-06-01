export async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary()
    t.text('email').notNullable().unique()
    t.text('password_hash').notNullable()
    t.text('last_name')
    t.text('first_name')
    t.text('phone')
    // superuser — скрытый владелец продукта; director — клиент; manager — оператор
    t.enu('role', ['manager', 'director', 'superuser']).notNullable().defaultTo('manager')
    t.boolean('is_active').notNullable().defaultTo(true)
    t.timestamp('created_at').defaultTo(knex.fn.now())
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('users')
}
