import { z } from 'zod'

export const loginInput = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
}).strict()

export const createUserInput = z.object({
  email: z.string().email(),
  password: z.string().min(6).optional(),
  last_name: z.string().optional(),
  first_name: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(['manager', 'director', 'superuser']).optional(),
}).strict()

export const updateUserInput = z.object({
  last_name: z.string().optional(),
  first_name: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(['manager', 'director', 'superuser']).optional(),
  is_active: z.boolean().optional(),
}).strict()
