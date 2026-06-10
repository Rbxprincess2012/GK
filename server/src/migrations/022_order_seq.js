// Приоритет/порядок исполнения заявки внутри водителя (на доске «На проверке»).
// Меньше seq — раньше выполнять. NULL — ещё не упорядочена (сортируем после, по номеру).
export async function up(knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.integer('seq')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('seq')
  })
}
