import { z } from 'zod'

const base = {
  client_id: z.number().int(),
  order_id: z.number().int().nullable().optional(),
  amount: z.number().optional(),
  status: z.enum(['issued', 'paid']).optional(),
  method: z.enum(['cashless', 'cash']).nullable().optional(),
}

export const createInvoice = z.object(base).strict()
export const updateInvoice = z.object(base).partial().strict()
