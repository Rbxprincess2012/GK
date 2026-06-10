// Добавляем 'pending_review' (Входящие — сырые заявки до обработки менеджером).
// Полный набор статусов заявки фиксируем здесь.

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
    CHECK (status IN ('new','assigned','in_progress','review','done','closed','cancelled'))`)
}
