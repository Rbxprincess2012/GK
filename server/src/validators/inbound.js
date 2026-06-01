import { z } from 'zod'

export const inboundInput = z.object({
  channel_id: z.number().int(),
  raw_text: z.string().optional(),
  media_url: z.string().optional(),
  transcript: z.string().optional(),
  external_message_id: z.string().optional(),
  linked_order_id: z.number().int().nullable().optional(),
}).strict()
