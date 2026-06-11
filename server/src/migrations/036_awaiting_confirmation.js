// Этап «подтверждение менеджером»: после «Завершить заявку» водителем заявка не уходит
// сразу в done и не падает в пул как new — она ждёт явного подтверждения менеджера
// (статус 'awaiting_confirmation'). Невыполненные участки выделяются в отдельные новые
// заявки; ссылка на родителя — split_from_order_id (для текста сообщения клиенту).
const dropStatusChecks = `
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP EXECUTE 'ALTER TABLE orders DROP CONSTRAINT ' || quote_ident(c); END LOOP;
END $$;`

const WITH = "'new','pending_review','assigned','in_progress','review','awaiting_confirmation','done','closed','cancelled','failed'"
const WITHOUT = "'new','pending_review','assigned','in_progress','review','done','closed','cancelled','failed'"

export async function up(knex) {
  await knex.raw(dropStatusChecks)
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (${WITH}))`)
  const has = await knex.schema.hasColumn('orders', 'split_from_order_id')
  if (!has) {
    await knex.schema.alterTable('orders', (t) => {
      t.integer('split_from_order_id').nullable().references('id').inTable('orders').onDelete('SET NULL')
    })
  }
}

export async function down(knex) {
  await knex.raw(dropStatusChecks)
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (${WITHOUT}))`)
  const has = await knex.schema.hasColumn('orders', 'split_from_order_id')
  if (has) await knex.schema.alterTable('orders', (t) => t.dropColumn('split_from_order_id'))
}
