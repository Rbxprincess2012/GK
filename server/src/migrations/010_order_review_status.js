// Добавляем статус заявки 'review' («На проверке») — этап между распределением
// и отправкой водителям: менеджер сверяет распределение по водителям.
// status в 003 заведён через knex .enu (varchar + CHECK). Имя констрейнта может
// отличаться, поэтому снимаем ЛЮБОЙ check по колонке status, затем ставим новый.

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

export async function up(knex) {
  await knex.raw(dropStatusChecks)
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('new','assigned','in_progress','review','done','closed','cancelled'))`)
}

export async function down(knex) {
  await knex.raw(dropStatusChecks)
  await knex.raw(`ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('new','assigned','in_progress','done','closed','cancelled'))`)
}
