// Пробег на старте и в конце смены (вводит водитель в боте). Для будущего расчёта
// топлива (сам расчёт — позже, сейчас только сбор данных).
export async function up(knex) {
  await knex.schema.alterTable('shifts', (t) => {
    t.integer('odometer_start')
    t.integer('odometer_end')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('shifts', (t) => {
    t.dropColumn('odometer_start')
    t.dropColumn('odometer_end')
  })
}
