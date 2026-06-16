import { z } from 'zod'

// Тип машины (справочник). slug генерится на сервере из названия, если не передан.
const base = {
  slug: z.string().optional(),
  name: z.string().min(1, 'Укажите название типа'),
  carries_containers: z.boolean().optional(),
  is_default: z.boolean().optional(),
  sort: z.number().int().optional(),
  archived: z.boolean().optional(),
}

export const createVehicleType = z.object(base).strict()
export const updateVehicleType = z.object(base).partial().strict()
