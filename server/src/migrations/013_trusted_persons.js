// Доверенные лица клиента (контакты на объектах) + мессенджер у водителей.
// Доверенное лицо принадлежит клиенту и может быть привязано к нескольким его объектам
// (связь many-to-many через object_trusted_persons). messenger — куда слать сообщения.
export async function up(knex) {
  await knex.schema.alterTable('drivers', (t) => {
    t.text('messenger') // 'telegram' | 'max' | null
  })

  await knex.schema.createTable('trusted_persons', (t) => {
    t.increments('id').primary()
    t.integer('client_id').references('clients.id').onDelete('CASCADE').notNullable()
    t.text('name').notNullable()
    t.text('phone')
    t.text('messenger') // 'telegram' | 'max' | null
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.index(['client_id'])
  })

  await knex.schema.createTable('object_trusted_persons', (t) => {
    t.integer('object_id').references('objects.id').onDelete('CASCADE').notNullable()
    t.integer('trusted_person_id').references('trusted_persons.id').onDelete('CASCADE').notNullable()
    t.primary(['object_id', 'trusted_person_id'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('object_trusted_persons')
  await knex.schema.dropTableIfExists('trusted_persons')
  await knex.schema.alterTable('drivers', (t) => {
    t.dropColumn('messenger')
  })
}
