// Состояние FSM водительского бота — в Postgres, чтобы переживало рестарт процесса.
// chat_id ↔ driver_id (после привязки); state — узел FSM; context — рабочие данные шага.
export async function up(knex) {
  await knex.schema.createTable('bot_sessions', (t) => {
    t.bigInteger('chat_id').primary()
    t.integer('driver_id').references('drivers.id').onDelete('SET NULL').nullable()
    t.text('state')
    t.jsonb('context').notNullable().defaultTo('{}')
    t.timestamp('updated_at').defaultTo(knex.fn.now())
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('bot_sessions')
}
