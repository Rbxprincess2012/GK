// Биллинг тенантов + журнал посещений (раздел супера «Учёт пользователей»).
//
// 1) companies += поля подписки: trial_started_at (ставится при ПЕРВОМ входе любого
//    пользователя компании), access_until (единая дата окончания доступа — и триал,
//    и оплата), is_trial (текущий период ещё пробный).
// 2) company_payments — аудит оплат (продление на N месяцев): сумма/скидка/период.
// 3) app_sessions — журнал посещений: вход = строка; last_seen_at обновляется
//    heartbeat'ом фронта, время на сервисе = sum(last_seen_at - started_at).
//
// Идемпотентно (hasColumn/hasTable) — безопасно повторно прогнать на проде.

export async function up(knex) {
  const addCol = async (name, build) => {
    if (!(await knex.schema.hasColumn('companies', name))) {
      await knex.schema.alterTable('companies', (t) => build(t))
    }
  }
  await addCol('trial_started_at', (t) => t.timestamp('trial_started_at'))
  await addCol('access_until', (t) => t.timestamp('access_until'))
  await addCol('is_trial', (t) => t.boolean('is_trial').notNullable().defaultTo(false))

  if (!(await knex.schema.hasTable('app_sessions'))) {
    await knex.schema.createTable('app_sessions', (t) => {
      t.increments('id').primary()
      t.integer('user_id').references('id').inTable('users').onDelete('CASCADE')
      t.integer('company_id').references('id').inTable('companies').onDelete('CASCADE')
      t.timestamp('started_at').notNullable().defaultTo(knex.fn.now())
      t.timestamp('last_seen_at').notNullable().defaultTo(knex.fn.now())
      t.string('ip')
      t.string('user_agent')
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.index(['company_id'])
      t.index(['user_id'])
    })
  }

  if (!(await knex.schema.hasTable('company_payments'))) {
    await knex.schema.createTable('company_payments', (t) => {
      t.increments('id').primary()
      t.integer('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE')
      t.integer('months').notNullable()
      t.decimal('amount', 12, 2)
      t.decimal('discount_pct', 5, 2)
      t.timestamp('access_until_before')
      t.timestamp('access_until_after')
      t.integer('created_by').references('id').inTable('users').onDelete('SET NULL')
      t.text('note')
      t.timestamp('created_at').defaultTo(knex.fn.now())
      t.index(['company_id'])
    })
  }
}

export async function down(knex) {
  if (await knex.schema.hasTable('company_payments')) await knex.schema.dropTable('company_payments')
  if (await knex.schema.hasTable('app_sessions')) await knex.schema.dropTable('app_sessions')
  for (const c of ['is_trial', 'access_until', 'trial_started_at']) {
    if (await knex.schema.hasColumn('companies', c)) {
      await knex.schema.alterTable('companies', (t) => t.dropColumn(c))
    }
  }
}
