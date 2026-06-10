// Сумма заявки. Прежде всего важна для НАЛИЧНОЙ оплаты — «сколько получил водитель».
// Видна на всех этапах и в ведомости сверки. Для безнала может быть пустой.
export async function up(knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.decimal('amount', 10, 2).nullable()
  })
}

export async function down(knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('amount')
  })
}
