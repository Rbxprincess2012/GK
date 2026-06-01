export async function up(knex) {
  // 1) Расширяем статусы заявки: pending_review (черновик от бота) и failed (не выполнено).
  await knex.raw('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check')
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending_review','new','assigned','in_progress','done','closed','cancelled','failed'))`)

  // 2) Поля жизненного цикла.
  await knex.schema.alterTable('orders', (t) => {
    t.timestamp('accepted_at')
    t.text('fail_reason')
  })

  // 3) Отложенная нумерация: number у черновиков NULL, присваивается при accept.
  //    Снимаем NOT NULL и serial-дефолт; саму последовательность orders_number_seq оставляем.
  await knex.raw('ALTER TABLE orders ALTER COLUMN number DROP NOT NULL')
  await knex.raw('ALTER TABLE orders ALTER COLUMN number DROP DEFAULT')

  // 4) Каналы: онбординг + уникальность чата + индекс владельца.
  await knex.schema.alterTable('channels', (t) => {
    t.text('verify_code')
    t.timestamp('verify_expires_at')
    t.timestamp('verified_at')
    t.unique(['type', 'external_id'])
    t.index(['owner_kind', 'owner_id'])
  })

  // 5) Дедуп входящих апдейтов мессенджера.
  await knex.schema.alterTable('inbound_messages', (t) => {
    t.text('external_message_id')
    t.unique(['external_message_id'])
  })
}

export async function down(knex) {
  await knex.schema.alterTable('inbound_messages', (t) => {
    t.dropUnique(['external_message_id'])
    t.dropColumn('external_message_id')
  })
  await knex.schema.alterTable('channels', (t) => {
    t.dropUnique(['type', 'external_id'])
    t.dropIndex(['owner_kind', 'owner_id'])
    t.dropColumn('verify_code')
    t.dropColumn('verify_expires_at')
    t.dropColumn('verified_at')
  })
  await knex.raw("ALTER TABLE orders ALTER COLUMN number SET DEFAULT nextval('orders_number_seq')")
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('accepted_at')
    t.dropColumn('fail_reason')
  })
  await knex.raw('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check')
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('new','assigned','in_progress','done','closed','cancelled'))`)
}
