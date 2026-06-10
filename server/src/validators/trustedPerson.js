import { z } from 'zod'

// Доверенное лицо привязано ЛИБО к группе (group_id), ЛИБО к клиенту (client_id).
// На вход обычно приходит client_id — бэкенд сам решит, переписать ли его на group_id.
const base = {
  client_id: z.number().int().nullable().optional(),
  group_id: z.number().int().nullable().optional(),
  name: z.string().min(1),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  messengers: z.array(z.enum(['telegram', 'max'])).optional(),
}

export const createTrustedPerson = z.object(base).strict()
export const updateTrustedPerson = z.object(base).partial().strict()
