// «Стандартный» размер контейнера: container_types.is_default. Единственный дефолт на справочник
// (гарантия — на уровне приложения: эндпоинт ставит true одному и false остальным в транзакции).
// Используется для автоподстановки размера в позиции заявки (Установить/Заменить).

export async function up(knex) {
  await knex.schema.alterTable('container_types', (t) => {
    t.boolean('is_default').notNullable().defaultTo(false)
  })
  // Если типы уже есть, а дефолт не задан — отметим наименьший по объёму (иначе первый),
  // чтобы автоподстановка работала сразу после миграции.
  const rows = await knex('container_types').select('id').orderByRaw('volume asc nulls last, id asc')
  if (rows.length) await knex('container_types').where({ id: rows[0].id }).update({ is_default: true })
}

export async function down(knex) {
  await knex.schema.alterTable('container_types', (t) => {
    t.dropColumn('is_default')
  })
}
