// Назначение доверенного лица теперь идёт НА УРОВНЕ участка (или объекта, если участков нет).
// Старый составной первичный ключ (object_id, trusted_person_id) запрещал назначать одно лицо
// на несколько участков одного объекта. Заменяем его на суррогатный id.
export async function up(knex) {
  await knex.schema.alterTable('object_trusted_persons', (t) => {
    t.dropPrimary()
  })
  await knex.schema.alterTable('object_trusted_persons', (t) => {
    t.increments('id').primary()
    t.index(['object_id'])
  })
}

export async function down(knex) {
  await knex.schema.alterTable('object_trusted_persons', (t) => {
    t.dropColumn('id')
  })
  await knex.schema.alterTable('object_trusted_persons', (t) => {
    t.primary(['object_id', 'trusted_person_id'])
  })
}
