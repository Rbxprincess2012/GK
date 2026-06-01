import { z } from 'zod'

export const upsertShiftInput = z.object({
  driver_id: z.number().int(),
  date: z.string(),
  shift_type: z.enum(['day', 'night']),
  status: z.enum(['planned', 'present', 'sick', 'vacation', 'absent']).optional(),
  vehicle_id: z.number().int().nullable().optional(),
  note: z.string().optional(),
}).strict()
