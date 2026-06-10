// Очередь исходящих писем сотрудникам (первичный пароль, смена пароля и пр.).
// Сама почтовая служба (SMTP) подключается позже — до тех пор письма
// надёжно копятся здесь со статусом pending и видны в админке.
export async function up(knex) {
  await knex.schema.createTable('email_outbox', (t) => {
    t.increments('id').primary()
    t.text('to_email').notNullable()
    t.text('subject').notNullable()
    t.text('body').notNullable()
    t.text('template')                       // account_created | password_reset | ...
    t.integer('user_id').references('users.id').onDelete('SET NULL').nullable()
    t.enu('status', ['pending', 'sent', 'failed']).notNullable().defaultTo('pending')
    t.text('error')
    t.integer('attempts').notNullable().defaultTo(0)
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('sent_at')
    t.index(['status'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('email_outbox')
}
