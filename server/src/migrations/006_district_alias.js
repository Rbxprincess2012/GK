export async function up(knex) {
  await knex.schema.alterTable('districts', (t) => {
    t.text('alias').nullable() // неофициальное / разговорное название (ГМР, ФМР, ЮМР…)
  })
}

export async function down(knex) {
  await knex.schema.alterTable('districts', (t) => {
    t.dropColumn('alias')
  })
}
