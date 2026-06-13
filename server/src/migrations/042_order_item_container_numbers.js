// Номер(а) контейнера для позиций «Заменить»/«Забрать»: какой именно контейнер
// водитель забирает/меняет. Свободный текст (напр. «12, 15»), опционально.
// Для «Поставить» не используется (ставим новый — номера ещё нет).
// Идемпотентна (hasColumn) — безопасна к повторному прогону на любой БД.
export async function up(knex) {
  const has = await knex.schema.hasColumn('order_items', 'container_numbers')
  if (!has) {
    await knex.schema.alterTable('order_items', (t) => {
      t.text('container_numbers')
    })
  }
}

export async function down(knex) {
  const has = await knex.schema.hasColumn('order_items', 'container_numbers')
  if (has) {
    await knex.schema.alterTable('order_items', (t) => {
      t.dropColumn('container_numbers')
    })
  }
}
