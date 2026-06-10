// Группа компаний (ГК) — наивысший уровень иерархии заказчиков.
// Одна ГК объединяет несколько юрлиц (clients.group_id, опционально).
// Доверенное лицо принадлежит ЛИБО группе (group_id) — общий пул на всю ГК,
// ЛИБО одиночному клиенту (client_id), если он не в группе.
export async function up(knex) {
  await knex.schema.createTable('company_groups', (t) => {
    t.increments('id').primary()
    t.text('name').notNullable()
    t.text('note')
    t.timestamp('created_at').defaultTo(knex.fn.now())
  })

  await knex.schema.alterTable('clients', (t) => {
    t.integer('group_id').references('company_groups.id').onDelete('SET NULL')
    t.index(['group_id'])
  })

  await knex.schema.alterTable('trusted_persons', (t) => {
    t.integer('group_id').references('company_groups.id').onDelete('CASCADE')
    t.index(['group_id'])
  })
  // client_id больше не обязателен: лицо может висеть на группе
  await knex.schema.alterTable('trusted_persons', (t) => {
    t.integer('client_id').nullable().alter()
  })
}

export async function down(knex) {
  await knex.schema.alterTable('trusted_persons', (t) => {
    t.dropColumn('group_id')
  })
  await knex.schema.alterTable('clients', (t) => {
    t.dropColumn('group_id')
  })
  await knex.schema.dropTableIfExists('company_groups')
}
