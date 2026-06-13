// Эпик #3: самостоятельная регистрация директора + раздел супера «Клиенты».
//
// 1) Таблица `companies` — компании-клиенты SaaS (тенанты). Суперпользователь
//    заводит карточку с реквизитами + email директора и «Предоставляет доступ».
// 2) Расширение `users`: подтверждение email кодом (регистрация/сброс пароля по
//    коду) + привязка пользователя к компании (company_id).
//
// Идемпотентно (hasTable/hasColumn) — безопасно повторно прогнать на проде.

export async function up(knex) {
  const hasCompanies = await knex.schema.hasTable('companies')
  if (!hasCompanies) {
    await knex.schema.createTable('companies', (t) => {
      t.increments('id').primary()
      // Реквизиты (зеркало settings.org / orgInput).
      t.string('company_name')
      t.string('legal_name')
      t.string('inn')
      t.string('kpp')
      t.string('ogrn')
      t.string('legal_address')
      t.string('phone')
      t.string('email')
      t.string('bank_name')
      t.string('bank_account')
      t.string('bik')
      t.string('corr_account')
      // Директор компании + статус выдачи доступа.
      t.string('director_email')
      t.boolean('access_granted').notNullable().defaultTo(false)
      t.timestamp('created_at').defaultTo(knex.fn.now())
    })
  }

  const addCol = async (name, build) => {
    if (!(await knex.schema.hasColumn('users', name))) {
      await knex.schema.alterTable('users', (t) => build(t))
    }
  }
  // Существующие пользователи — уже подтверждены (default true), чтобы вход не сломался.
  await addCol('email_verified', (t) => t.boolean('email_verified').notNullable().defaultTo(true))
  await addCol('verify_code', (t) => t.string('verify_code'))
  await addCol('verify_expires', (t) => t.timestamp('verify_expires'))
  await addCol('verify_attempts', (t) => t.integer('verify_attempts').notNullable().defaultTo(0))
  await addCol('verify_purpose', (t) => t.string('verify_purpose')) // 'register' | 'reset'
  await addCol('company_id', (t) => t.integer('company_id').references('id').inTable('companies').onDelete('SET NULL'))
}

export async function down(knex) {
  for (const c of ['company_id', 'verify_purpose', 'verify_attempts', 'verify_expires', 'verify_code', 'email_verified']) {
    if (await knex.schema.hasColumn('users', c)) {
      await knex.schema.alterTable('users', (t) => t.dropColumn(c))
    }
  }
  if (await knex.schema.hasTable('companies')) await knex.schema.dropTable('companies')
}
