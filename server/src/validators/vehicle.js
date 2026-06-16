import { z } from 'zod'

const base = {
  gov_number: z.string().min(1),
  kind: z.enum(['container', 'grapple']).optional(), // контейнеровоз | грейфер (ковш, вывоз навалом)
  capacity_slots: z.number().int().positive().optional(),
  empty_capacity: z.number().int().positive().optional(),
  fuel_norm: z.number().optional(),
  status: z.enum(['active', 'broken', 'repair']).optional(),
  mileage: z.number().int().nonnegative().optional(),
  model: z.string().optional(),
}

export const createVehicle = z.object(base).strict()
export const updateVehicle = z.object(base).partial().strict()
