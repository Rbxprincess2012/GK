import { z } from 'zod'

const base = {
  number: z.string().min(1),
  type_id: z.number().int(),
  state: z.enum(['empty', 'full']).optional(),
  location: z.enum(['warehouse', 'object', 'in_transit']).optional(),
  object_id: z.number().int().nullable().optional(),
}

export const createContainer = z.object(base).strict()
export const updateContainer = z.object(base).partial().strict()
