// Участки объекта (необязательный уровень под объектом — для крупных объектов).
// Доверенное лицо привязывается к объекту (section_id = null) ИЛИ к конкретному участку.
// Плюс контактное доверенное лицо на самой заявке (orders.trusted_person_id).
export async function up(knex) {
  await knex.schema.createTable('sections', (t) => {
    t.increments('id').primary()
    t.integer('object_id').references('objects.id').onDelete('CASCADE').notNullable()
    t.text('name').notNullable()
    t.text('note')
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.index(['object_id'])
  })

  // К связке объект↔лицо добавляем уровень (участок). null = на весь объект.
  await knex.schema.alterTable('object_trusted_persons', (t) => {
    t.integer('section_id').references('sections.id').onDelete('CASCADE').nullable()
  })

  await knex.schema.alterTable('orders', (t) => {
    t.integer('trusted_person_id').references('trusted_persons.id').onDelete('SET NULL').nullable()
  })
}

export async function down(knex) {
  await knex.schema.alterTable('orders', (t) => { t.dropColumn('trusted_person_id') })
  await knex.schema.alterTable('object_trusted_persons', (t) => { t.dropColumn('section_id') })
  await knex.schema.dropTableIfExists('sections')
}
