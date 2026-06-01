// Один раз перед всеми тестами: пересоздать тестовую схему и накатить миграции в неё.
process.env.PGSCHEMA = 'dispatcher_test'

let dbRef

export async function setup() {
  const { db } = await import('../src/db.js')
  dbRef = db
  await db.raw('DROP SCHEMA IF EXISTS dispatcher_test CASCADE')
  await db.raw('CREATE SCHEMA dispatcher_test')
  await db.migrate.latest()
  // пул НЕ закрываем — он нужен в teardown
}

export async function teardown() {
  const db = dbRef ?? (await import('../src/db.js')).db
  await db.raw('DROP SCHEMA IF EXISTS dispatcher_test CASCADE')
  await db.destroy()
}
