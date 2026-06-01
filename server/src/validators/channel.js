import { z } from 'zod'

export const issueCodeInput = z.object({
  owner_kind: z.enum(['client', 'driver']),
  owner_id: z.number().int(),
  type: z.enum(['telegram', 'max', 'phone']).optional(),
}).strict()

export const verifyInput = z.object({
  type: z.enum(['telegram', 'max', 'phone']).optional(),
  external_id: z.string().min(1),
  code: z.string().min(1),
}).strict()

export const resolveInput = z.object({
  type: z.enum(['telegram', 'max', 'phone']).optional(),
  external_id: z.string().min(1),
}).strict()
