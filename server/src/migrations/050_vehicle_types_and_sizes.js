// Типы машин — редактируемый справочник (vehicle_types): контейнеровоз/грейфер/газель/самосвал
// + пользовательские. carries_containers=true → машина возит контейнеры (для неё задаются
// размеры); false → вывоз навалом (грейфер/газель/самосвал), как услуга без контейнеров.
//
// `vehicles.kind` и `orders.service_type` остаются slug-полями (значения 'container'/'grapple'
// уже совпадают со слугами справочника) — снимаем с них enum-CHECK, чтобы допускать новые типы.
//
// vehicle_container_types — какие размеры контейнеров возит машина (many-to-many; один основной).
// Сегрегация распределения: размеры заявки (order_items.container_type_id) ⊆ размеры машины.
export async function up(knex) {
  if (!(await knex.schema.hasTable('vehicle_types'))) {
    await knex.schema.createTable('vehicle_types', (t) => {
      t.increments('id').primary()
      t.text('slug').notNullable().unique()
      t.text('name').notNullable()
      t.boolean('carries_containers').notNullable().defaultTo(false)
      t.boolean('is_default').notNullable().defaultTo(false) // тип по умолчанию в формах
      t.integer('sort').notNullable().defaultTo(0)
      t.boolean('archived').notNullable().defaultTo(false)
    })
    await knex('vehicle_types').insert([
      { slug: 'container', name: 'Контейнеровоз', carries_containers: true, is_default: true, sort: 0 },
      { slug: 'grapple', name: 'Грейфер', carries_containers: false, sort: 1 },
      { slug: 'gazelle', name: 'Газель', carries_containers: false, sort: 2 },
      { slug: 'samosval', name: 'Самосвал', carries_containers: false, sort: 3 },
    ])
  }

  // Снимаем enum-CHECK (created by t.enu в миграции 048) → разрешаем любые slug-типы.
  await knex.raw('ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_kind_check')
  await knex.raw('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_service_type_check')

  if (!(await knex.schema.hasTable('vehicle_container_types'))) {
    await knex.schema.createTable('vehicle_container_types', (t) => {
      t.increments('id').primary()
      t.integer('vehicle_id').notNullable().references('id').inTable('vehicles').onDelete('CASCADE')
      t.integer('container_type_id').notNullable().references('id').inTable('container_types').onDelete('CASCADE')
      t.boolean('is_default').notNullable().defaultTo(false) // основной размер машины
      t.unique(['vehicle_id', 'container_type_id'])
    })
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('vehicle_container_types')
  await knex.schema.dropTableIfExists('vehicle_types')
  // CHECK-констрейнты не восстанавливаем: их отсутствие безопасно (slug валидируется в приложении).
}
