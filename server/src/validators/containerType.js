import { z } from 'zod'

const base = {
  name: z.string().min(1),
  volume: z.number().nullable().optional(),
  is_default: z.boolean().optional(),
}

export const createContainerType = z.object(base).strict()
export const updateContainerType = z.object(base).partial().strict()
