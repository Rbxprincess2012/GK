import { z } from 'zod'

const base = {
  name: z.string().min(1),
  phone: z.string().optional(),
  is_active: z.boolean().optional(),
  default_vehicle_id: z.number().int().nullable().optional(),
}

export const createDriver = z.object(base).strict()
export const updateDriver = z.object(base).partial().strict()
