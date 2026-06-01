import { db } from '../src/db.js'

// Порядок не важен — TRUNCATE ... CASCADE снимает FK. RESTART IDENTITY обнуляет счётчики.
const TABLES = [
  'order_item_containers', 'attachments', 'container_movements', 'order_items', 'orders',
  'route_stops', 'routes', 'invoices', 'shifts', 'outbox', 'inbound_messages', 'channels',
  'containers', 'objects', 'streets', 'drivers', 'vehicles', 'clients',
  'container_types', 'districts', 'settings', 'users',
]

export async function resetDb() {
  const list = TABLES.map((t) => `dispatcher_test."${t}"`).join(', ')
  await db.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
}
