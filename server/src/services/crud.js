import { db } from '../db.js'

export function makeCrud(table) {
  return {
    list: (where = {}) => db(table).where(where).orderBy('id'),
    get: async (id) => (await db(table).where({ id }).first()) ?? null,
    create: async (data) => (await db(table).insert(data).returning('*'))[0],
    update: async (id, data) => (await db(table).where({ id }).update(data).returning('*'))[0] ?? null,
    remove: (id) => db(table).where({ id }).del(),
  }
}
