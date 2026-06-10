import { z } from 'zod'

export const rejectInput = z.object({
  comment: z.string().min(1, 'нужен комментарий — что переснять'),
}).strict()
