// Проверка пруфов менеджером — отдельная ось на под-задаче, НЕ статус заявки.
// proof_status: unreviewed → accepted | rejected. reject_count — счётчик возвратов.
export async function up(knex) {
  await knex.schema.alterTable('order_subtasks', (t) => {
    t.enu('proof_status', ['unreviewed', 'accepted', 'rejected']).notNullable().defaultTo('unreviewed')
    t.integer('reviewed_by').references('users.id').onDelete('SET NULL').nullable()
    t.timestamp('reviewed_at')
    t.text('review_comment')
    t.integer('reject_count').notNullable().defaultTo(0)
  })
}

export async function down(knex) {
  await knex.schema.alterTable('order_subtasks', (t) => {
    t.dropColumn('proof_status')
    t.dropColumn('reviewed_by')
    t.dropColumn('reviewed_at')
    t.dropColumn('review_comment')
    t.dropColumn('reject_count')
  })
}
