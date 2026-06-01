export async function up(knex) {
  await knex.schema.createTable('districts', (t) => {
    t.increments('id').primary()
    t.text('name').notNullable().unique()
    t.enu('kind', ['city', 'rural']).notNullable().defaultTo('city')
  })
  await knex.schema.createTable('streets', (t) => {
    t.increments('id').primary()
    t.text('name').notNullable()
    t.integer('district_id').references('districts.id').notNullable()
    t.index(['name'])
  })
  await knex.schema.createTable('container_types', (t) => {
    t.increments('id').primary()
    t.text('name').notNullable().unique()
    t.decimal('volume', 6, 2).nullable()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('streets')
  await knex.schema.dropTableIfExists('container_types')
  await knex.schema.dropTableIfExists('districts')
}
