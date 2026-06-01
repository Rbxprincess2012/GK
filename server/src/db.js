import { fileURLToPath } from 'node:url'
import knexLib from 'knex'
import pg from 'pg'
import { pgConnection } from './config.js'

// PostgreSQL-тип DATE (OID 1082) приходит как JS Date и при JSON-сериализации
// уезжает в UTC (−3 ч для Краснодара) → дата сдвигается на день назад.
// Отдаём DATE как есть — строкой 'YYYY-MM-DD'.
pg.types.setTypeParser(1082, (v) => v)

// Для тестов через PGSCHEMA задаём отдельную схему (изоляция от public с seed-данными).
const searchPath = process.env.PGSCHEMA ? [process.env.PGSCHEMA] : undefined

export const db = knexLib({
  client: 'pg',
  connection: pgConnection(),
  ...(searchPath ? { searchPath } : {}),
  migrations: { directory: fileURLToPath(new URL('./migrations', import.meta.url)) },
  pool: { min: 0, max: 10 },
})
