// Флаг «разобрано» для вопросов, на которые ИИ не нашёл ответа. Суперпользователь в разделе
// «Вопросы без ответа» помечает обработанные (дополнил базу знаний / ответил человеку), и они
// уходят из списка-ворклиста. Сами логи не удаляем — нужны для роста базы и статистики.
export async function up(knex) {
  await knex.schema.alterTable('assistant_logs', (t) => {
    t.boolean('resolved').notNullable().defaultTo(false)
    t.index(['resolved', 'created_at'])
  })
}

export async function down(knex) {
  await knex.schema.alterTable('assistant_logs', (t) => {
    t.dropIndex(['resolved', 'created_at'])
    t.dropColumn('resolved')
  })
}
