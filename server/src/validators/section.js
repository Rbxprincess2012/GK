import { z } from 'zod'

const base = {
  object_id: z.number().int(),
  name: z.string().min(1),
  note: z.string().nullable().optional(),
}

export const createSection = z.object(base).strict()
export const updateSection = z.object(base).partial().strict()
