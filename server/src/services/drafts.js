import { db } from '../db.js'
import { createOrder } from './orders.js'

// Создать черновик из входящего сообщения бота. client_id берём из канала
// (owner_kind='client'), если явно не передан.
export async function createDraft(payload) {
  const ch = await db('channels').where({ id: payload.channel_id }).first()
  if (!ch) throw Object.assign(new Error('channel_not_found'), { status: 404 })
  const client_id = payload.client_id
    ?? (ch.owner_kind === 'client' ? ch.owner_id : null)
  const [row] = await db('order_drafts').insert({
    channel_id: payload.channel_id,
    client_id,
    object_id: payload.object_id ?? null,
    object_hint: payload.object_hint ?? null,
    desired_date: payload.desired_date ?? null,
    desired_time: payload.desired_time ?? null,
    task_text: payload.task_text,
    raw_message: payload.raw_message ?? null,
    transcript: payload.transcript ?? null,
    source_kind: payload.source_kind ?? 'text',
    ambiguities: JSON.stringify(payload.ambiguities ?? []),
    llm_extraction: payload.llm_extraction ? JSON.stringify(payload.llm_extraction) : null,
    status: 'need_review',
  }).returning('*')
  return row
}

// «Входящие» диспетчера: по умолчанию только need_review, иначе фильтр по статусу.
export function listDrafts(filter = {}) {
  let q = db('order_drafts as d')
    .leftJoin('clients as c', 'c.id', 'd.client_id')
    .leftJoin('objects as o', 'o.id', 'd.object_id')
    .select(
      'd.*',
      'c.legal_name as client_legal_name', 'c.nickname as client_nickname',
      'o.informal_name as object_name', 'o.house as object_house',
    )
    .orderBy('d.created_at', 'desc')
  q = filter.status ? q.where('d.status', filter.status) : q.where('d.status', 'need_review')
  return q
}

export const getDraft = (id) => db('order_drafts').where({ id }).first()

// Согласование: диспетчер сматчил объект + проставил позиции → создаём настоящую заявку
// (сразу new, с номером — отдельный accept не нужен) и помечаем черновик promoted.
export async function promote(id, orderPayload) {
  const draft = await db('order_drafts').where({ id, status: 'need_review' }).first()
  if (!draft) throw Object.assign(new Error('not_promotable'), { status: 409 })
  const order = await createOrder({ ...orderPayload, status: 'new' })
  await db('order_drafts').where({ id })
    .update({ status: 'promoted', promoted_order_id: order.id, updated_at: db.fn.now() })
  return order
}

// Отклонить черновик (спам/нерелевантно) с причиной.
export async function reject(id, { reason = null } = {}) {
  const [row] = await db('order_drafts').where({ id, status: 'need_review' })
    .update({ status: 'rejected', reject_reason: reason, updated_at: db.fn.now() })
    .returning('*')
  if (!row) throw Object.assign(new Error('not_rejectable'), { status: 409 })
  return row
}
