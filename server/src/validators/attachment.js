import { z } from 'zod'

export const attachmentInput = z.object({
  kind: z.enum(['photo', 'audio', 'text']),
  file_url: z.string().optional(),
  transcript: z.string().optional(),
  author_driver_id: z.number().int().nullable().optional(),
}).strict()
