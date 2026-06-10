// Участок у позиции заявки: одна заявка на объекте может адресовать разные участки
// (напр. «заменить контейнеры на участках 58 и 62»). section_id = null → весь объект.
export async function up(knex) {
  await knex.schema.alterTable('order_items', (t) => {
    t.integer('section_id').references('sections.id').onDelete('SET NULL').nullable()
    t.index(['section_id'])
  })
}

export async function down(knex) {
  await knex.schema.alterTable('order_items', (t) => {
    t.dropColumn('section_id')
  })
}
