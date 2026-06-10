import { z } from 'zod'

const base = {
  name: z.string().min(1),
  note: z.string().nullable().optional(),
}

export const createCompanyGroup = z.object(base).strict()
export const updateCompanyGroup = z.object(base).partial().strict()
