// Применить одно движение контейнера к таблице containers (в рамках транзакции).
export async function applyMovement(trx, { container_id, direction, object_id }) {
  if (direction === 'picked_up') {
    // забрали с объекта: уезжает в рейс, помечаем полным, снимаем с объекта
    await trx('containers').where({ id: container_id })
      .update({ location: 'in_transit', state: 'full', object_id: null })
  } else {
    // delivered: привезли пустой и поставили на объект
    await trx('containers').where({ id: container_id })
      .update({ location: 'object', state: 'empty', object_id })
  }
}
