import { z } from 'zod'

// Создание черновика (дёргает n8n по сервисному токену). Структурных позиций тут нет —
// операционная суть лежит в task_text. client_id выводится из канала, если не передан.
export const createDraftInput = z.object({
  channel_id: z.number().int(),
  client_id: z.number().int().nullable().optional(),
  object_id: z.number().int().nullable().optional(),
  object_hint: z.string().nullable().optional(),
  desired_date: z.string().nullable().optional(),
  desired_time: z.string().nullable().optional(),
  task_text: z.string().min(1),
  raw_message: z.string().nullable().optional(),
  transcript: z.string().nullable().optional(),
  source_kind: z.enum(['text', 'voice']).optional(),
  ambiguities: z.array(z.string()).optional(),
  llm_extraction: z.any().optional(), // исходный JSON от ИИ — для петли обучения
}).strict()

export const rejectDraftInput = z.object({
  reason: z.string().optional(),
}).strict()
