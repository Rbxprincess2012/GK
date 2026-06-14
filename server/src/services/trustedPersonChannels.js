import { randomInt } from 'node:crypto'
import { db } from './../db.js'

// Онбординг доверенного лица в мессенджер (личный chat_id для авто-отправки отчётов).
// Два канала живут разными колонками: Telegram → tg_*, MAX → max_* (миграции 041 и 045).
//  • issuePersonInvite → pending + одноразовый код (7 дней), ссылка deep-link
//  • bindPersonByCode  → pending → active, проставить <ch>_chat_id, погасить код
//  • revokePersonChannel → снять привязку канала (revoked, chat_id обнулить)

const code6 = () => String(randomInt(100000, 1000000))
// Префикс колонок по каналу: 'telegram' → tg_*, 'max' → max_*.
const pfx = (channel) => (channel === 'max' ? 'max' : 'tg')

export async function issuePersonInvite(personId, channel = 'telegram') {
  const p = pfx(channel)
  const [row] = await db('trusted_persons').where({ id: personId }).update({
    [`${p}_status`]: 'pending',
    [`${p}_verify_code`]: code6(),
    [`${p}_verify_expires_at`]: db.raw("now() + interval '7 days'"),
  }).returning('*')
  return row ?? null
}

// Привязать личный чат лица по коду: pending → active. null — код не найден/просрочен.
export async function bindPersonByCode(verifyCode, { chat_id, channel = 'telegram' }, conn = db) {
  const p = pfx(channel)
  const person = await conn('trusted_persons')
    .where({ [`${p}_verify_code`]: verifyCode, [`${p}_status`]: 'pending' })
    .andWhere(`${p}_verify_expires_at`, '>', conn.fn.now())
    .first()
  if (!person) return null
  const [row] = await conn('trusted_persons').where({ id: person.id }).update({
    [`${p}_chat_id`]: chat_id, [`${p}_status`]: 'active',
    [`${p}_verify_code`]: null, [`${p}_verify_expires_at`]: null,
  }).returning('*')
  return row
}

export async function revokePersonChannel(personId, channel = 'telegram') {
  const p = pfx(channel)
  const [row] = await db('trusted_persons').where({ id: personId }).update({
    [`${p}_status`]: 'revoked', [`${p}_chat_id`]: null,
    [`${p}_verify_code`]: null, [`${p}_verify_expires_at`]: null,
  }).returning('*')
  return row ?? null
}

// Доверенные лица объекта, у которых активен ХОТЯ БЫ ОДИН канал — кому слать отчёт.
// Возвращаем оба канала; разворот в конкретные target по каналам — в clientDelivery.
// distinct по лицу: одно лицо может быть привязано к нескольким участкам объекта.
export async function activePersonsForObject(objectId, conn = db) {
  return conn('object_trusted_persons as otp')
    .join('trusted_persons as tp', 'tp.id', 'otp.trusted_person_id')
    .where('otp.object_id', objectId)
    .andWhere((b) => b.where('tp.tg_status', 'active').orWhere('tp.max_status', 'active'))
    .distinct('tp.id', 'tp.name', 'tp.tg_chat_id', 'tp.tg_status', 'tp.max_chat_id', 'tp.max_status')
}
