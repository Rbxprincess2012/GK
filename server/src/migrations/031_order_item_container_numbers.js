// Номер(а) контейнера для позиций «Заменить»/«Забрать»: какой именно контейнер
// водитель забирает/меняет. Свободный текст (напр. «12, 15»), опционально.
// Для «Поставить» не используется (ставим новый — номера ещё нет).
export async function up(knex) {
  await knex.schema.alterTable('order_items', (t) => {
    t.text('container_numbers')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('order_items', (t) => {
    t.dropColumn('container_numbers')
  })
}
