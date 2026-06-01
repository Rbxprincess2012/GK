import { describe, it, expect, afterAll } from 'vitest'
import { db } from '../src/db.js'

const EXPECTED = ['districts', 'streets', 'container_types', 'clients', 'objects',
  'vehicles', 'drivers', 'containers', 'orders', 'order_items', 'order_item_containers',
  'container_movements', 'attachments', 'shifts', 'routes', 'route_stops', 'invoices',
  'settings', 'channels', 'inbound_messages']

describe('migrations', () => {
  it('все таблицы существуют после migrate:latest', async () => {
    for (const tbl of EXPECTED) {
      expect(await db.schema.hasTable(tbl), `нет таблицы ${tbl}`).toBe(true)
    }
  })
  afterAll(async () => { await db.destroy() })
})
