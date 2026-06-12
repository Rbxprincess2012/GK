// Адреса чатов доверенного лица по мессенджерам — куда менеджер хочет слать точечно.
// { telegram: '<@username | ссылка t.me | chat_id>', max: '<ссылка max.ru | id>' }.
// Заполняется вручную в модалке доверенных лиц (рядом с выбором TG/MAX).
export async function up(knex) {
  if (!(await knex.schema.hasColumn('trusted_persons', 'chats'))) {
    await knex.schema.alterTable('trusted_persons', (t) => {
      t.jsonb('chats').notNullable().defaultTo('{}')
    })
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('trusted_persons', 'chats')) {
    await knex.schema.alterTable('trusted_persons', (t) => t.dropColumn('chats'))
  }
}
