// Под-задача = (заявка, участок). Единица выполнения, исхода и пруфа.
// section_id = null → вся заявка без участков (одна под-задача). sub_no стабилен → показ 35.1/35.2.
// Заявка done, когда все под-задачи done; смешанный исход → остаток возвращается в пул.
export async function up(knex) {
  await knex.schema.createTable('order_subtasks', (t) => {
    t.increments('id').primary()
    t.integer('order_id').references('orders.id').onDelete('CASCADE').notNullable()
    t.integer('section_id').references('sections.id').onDelete('SET NULL').nullable()
    t.integer('sub_no').notNullable()
    t.enu('status', ['pending', 'done', 'failed']).notNullable().defaultTo('pending')
    t.text('reason_code')
    t.text('comment')
    t.timestamp('completed_at')
    t.integer('completed_by_driver_id').references('drivers.id').onDelete('SET NULL').nullable()
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.unique(['order_id', 'section_id'])
    t.index(['order_id'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('order_subtasks')
}
