import { z } from 'zod'

export const createOrderInput = z.object({
  object_id: z.number().int(),
  payment_method: z.enum(['cashless', 'cash']).optional(),
  desired_date: z.string().optional(),
  desired_time: z.string().optional(),
  note: z.string().optional(),
  // 'pending_review' — черновик от бота (без номера до accept); по умолчанию 'new'
  status: z.enum(['new', 'pending_review']).optional(),
  items: z.array(z.object({
    action: z.enum(['place', 'replace', 'haul']),
    container_type_id: z.number().int(),
    quantity: z.number().int().positive(),
    waste_class: z.enum(['4', '5']).optional(),
    requested_container_ids: z.array(z.number().int()).optional(),
  })).min(1),
}).strict()

const attachment = z.object({
  kind: z.enum(['photo', 'audio', 'text']),
  file_url: z.string().optional(),
  transcript: z.string().optional(),
  author_driver_id: z.number().int().nullable().optional(),
})

export const driverConfirmInput = z.object({
  attachments: z.array(attachment).optional(),
}).strict()

export const failInput = z.object({
  reason: z.string().optional(),
}).strict()

export const assignInput = z.object({
  driver_id: z.number().int(),
  shift_date: z.string(),
  shift_type: z.enum(['day', 'night']),
  vehicle_id: z.number().int().nullable().optional(),
}).strict()

export const completeInput = z.object({
  movements: z.array(z.object({
    container_id: z.number().int(),
    direction: z.enum(['delivered', 'picked_up']),
  })).optional(),
  attachments: z.array(z.object({
    kind: z.enum(['photo', 'audio', 'text']),
    file_url: z.string().optional(),
    transcript: z.string().optional(),
    author_driver_id: z.number().int().nullable().optional(),
  })).optional(),
}).strict()
