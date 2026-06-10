// Чиним orders_status_check: статус 'failed' (водитель «не выполнено») добавляла
// миграция 006, но 011 пересоздавала CHECK без него — на уже мигрированной БД
// попытка пометить заявку failed падала на constraint. Возвращаем полный набор.
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

const ALL = "'new','pending_review','assigned','in_progress','review','done','closed','cancelled','failed'"

export async function up(knex) {
  await knex.raw(dropStatusChecks)
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (${ALL}))`)
}

export async function down(knex) {
  await knex.raw(dropStatusChecks)
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('new','pending_review','assigned','in_progress','review','done','closed','cancelled'))`)
}
