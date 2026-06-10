// Город (населённый пункт) у объекта — для адреса в заявке (без округов/районов).
// Фамилия/имя как отдельные поля у водителей и доверенных лиц; name остаётся как
// отображаемое (собирается из «Фамилия Имя»). Бэкофилл: разбиваем name по первому пробелу.
export async function up(knex) {
  await knex.schema.alterTable('objects', (t) => { t.text('city') })
  await knex.schema.alterTable('drivers', (t) => { t.text('first_name'); t.text('last_name') })
  await knex.schema.alterTable('trusted_persons', (t) => { t.text('first_name'); t.text('last_name') })

  for (const tbl of ['drivers', 'trusted_persons']) {
    await knex.raw(
      `UPDATE ?? SET
         last_name  = split_part(name, ' ', 1),
         first_name = CASE WHEN position(' ' in name) > 0
                          THEN trim(substr(name, position(' ' in name) + 1))
                          ELSE '' END
       WHERE name IS NOT NULL`,
      [tbl],
    )
  }
}

export async function down(knex) {
  await knex.schema.alterTable('objects', (t) => { t.dropColumn('city') })
  await knex.schema.alterTable('drivers', (t) => { t.dropColumn('first_name'); t.dropColumn('last_name') })
  await knex.schema.alterTable('trusted_persons', (t) => { t.dropColumn('first_name'); t.dropColumn('last_name') })
}
