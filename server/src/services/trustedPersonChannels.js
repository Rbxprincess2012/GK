import { randomInt } from 'node:crypto'
import { db } from './../db.js'

// Онбординг доверенного лица в Telegram (личный chat_id для авто-отправки отчётов).
// По аналогии с client_recipients, но канал живёт прямо в trusted_persons.
//  • issuePersonInvite → pending + одноразовый код (7 дней), ссылка /start p<code>
//  • bindPersonByCode  → pending → active, проставить tg_chat_id, погасить код
//  • revokePersonChannel → снять привязку (revoked, chat_id обнулить)

const code6 = () => String(randomInt(100000, 1000000))

export async function issuePersonInvite(personId) {
  const [row] = await db('trusted_persons').where({ id: personId }).update({
    tg_status: 'pending',
    tg_verify_code: code6(),
    tg_verify_expires_at: db.raw("now() + interval '7 days'"),
  }).returning('*')
  return row ?? null
}

// Привязать личный чат лица по коду: pending → active. null — код не найден/просрочен.
export async function bindPersonByCode(verifyCode, { chat_id }, conn = db) {
  const p = await conn('trusted_persons')
    .where({ tg_verify_code: verifyCode, tg_status: 'pending' })
    .andWhere('tg_verify_expires_at', '>', conn.fn.now())
    .first()
  if (!p) return null
  const [row] = await conn('trusted_persons').where({ id: p.id }).update({
    tg_chat_id: chat_id, tg_status: 'active',
    tg_verify_code: null, tg_verify_expires_at: null,
  }).returning('*')
  return row
}

export async function revokePersonChannel(personId) {
  const [row] = await db('trusted_persons').where({ id: personId }).update({
    tg_status: 'revoked', tg_chat_id: null, tg_verify_code: null, tg_verify_expires_at: null,
  }).returning('*')
  return row ?? null
}

// Активные (привязанные) лица объекта — кому реально слать отчёт в Telegram.
// distinct по лицу: одно лицо может быть привязано к нескольким участкам объекта.
export async function activePersonsForObject(objectId, conn = db) {
  return conn('object_trusted_persons as otp')
    .join('trusted_persons as tp', 'tp.id', 'otp.trusted_person_id')
    .where('otp.object_id', objectId)
    .andWhere('tp.tg_status', 'active')
    .whereNotNull('tp.tg_chat_id')
    .distinct('tp.id', 'tp.tg_chat_id', 'tp.name')
}
