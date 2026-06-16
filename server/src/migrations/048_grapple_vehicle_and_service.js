// Грейфер — второй тип машины (грузовик с ковшом, грузит навалом, без контейнеров).
// Машина получает тип (kind): контейнеровоз | грейфер. Заявка получает тип услуги
// (service_type) и число ходок грейфера (grapple_runs). Грейфер заказывается только
// на вывоз, без контейнерных позиций. Дефолты сохраняют прежнее поведение (container).
export async function up(knex) {
  await knex.schema.alterTable('vehicles', (t) => {
    t.enu('kind', ['container', 'grapple']).notNullable().defaultTo('container')
  })
  await knex.schema.alterTable('orders', (t) => {
    t.enu('service_type', ['container', 'grapple']).notNullable().defaultTo('container')
    t.integer('grapple_runs') // число ходок грейфера; значимо только для service_type='grapple'
  })
}

export async function down(knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('grapple_runs')
    t.dropColumn('service_type')
  })
  await knex.schema.alterTable('vehicles', (t) => {
    t.dropColumn('kind')
  })
}
