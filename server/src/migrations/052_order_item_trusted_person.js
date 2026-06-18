// Доверенное лицо на уровне позиции заявки: контакт на месте по конкретному участку.
// По умолчанию во фронте подставляется лицо, привязанное к участку/объекту в «Клиентах»,
// но менеджер может переопределить прямо в заявке. Nullable + SET NULL (как orders.trusted_person_id).
export async function up(knex) {
  await knex.schema.alterTable('order_items', (t) => {
    t.integer('trusted_person_id').references('trusted_persons.id').onDelete('SET NULL').nullable()
  })
}

export async function down(knex) {
  await knex.schema.alterTable('order_items', (t) => { t.dropColumn('trusted_person_id') })
}
