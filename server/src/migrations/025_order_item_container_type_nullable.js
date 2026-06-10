// Тип контейнера и класс отходов временно выводятся из оборота («на заглушку»):
// в формах их больше нет, заявка-позиция = вид работы + количество.
// Колонку container_type_id не удаляем (чтобы позже легко вернуть фичу),
// а лишь снимаем NOT NULL — позиции пишутся без типа.
export async function up(knex) {
  await knex.raw('ALTER TABLE order_items ALTER COLUMN container_type_id DROP NOT NULL')
}

export async function down(knex) {
  await knex.raw('ALTER TABLE order_items ALTER COLUMN container_type_id SET NOT NULL')
}
