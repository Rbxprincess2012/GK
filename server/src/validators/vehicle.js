import { z } from 'zod'

const base = {
  gov_number: z.string().min(1),
  // Тип машины — slug из справочника vehicle_types (container/grapple/gazelle/samosval/кастом).
  kind: z.string().optional(),
  capacity_slots: z.number().int().positive().optional(),
  empty_capacity: z.number().int().positive().optional(),
  fuel_norm: z.number().optional(),
  status: z.enum(['active', 'broken', 'repair']).optional(),
  mileage: z.number().int().nonnegative().optional(),
  model: z.string().optional(),
  // Возимые размеры контейнеров (для контейнеровоза): [{ container_type_id, is_default? }].
  sizes: z.array(z.object({
    container_type_id: z.number().int(),
    is_default: z.boolean().optional(),
  })).optional(),
}

export const createVehicle = z.object(base).strict()
export const updateVehicle = z.object(base).partial().strict()
