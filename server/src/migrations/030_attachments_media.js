// Медиа-пруф: добавляем 'video' к видам вложений (голос = audio), привязку к под-задаче
// и кэш tg_file_id. order_id остаётся NOT NULL — пруф цепляется и к заявке, и к под-задаче.
// file_url — первичен (своё хранилище), tg_file_id — кэш Telegram.
export async function up(knex) {
  await knex.raw('ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_kind_check')
  await knex.raw("ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('photo','audio','text','video'))")
  await knex.schema.alterTable('attachments', (t) => {
    t.integer('subtask_id').references('order_subtasks.id').onDelete('SET NULL').nullable()
    t.text('tg_file_id')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('attachments', (t) => {
    t.dropColumn('tg_file_id')
    t.dropColumn('subtask_id')
  })
  await knex.raw('ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_kind_check')
  await knex.raw("ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('photo','audio','text'))")
}
