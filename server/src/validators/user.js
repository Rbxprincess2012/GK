import { z } from 'zod'

export const loginInput = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
}).strict()

const personFields = {
  last_name: z.string().optional(),
  first_name: z.string().optional(),
  phone: z.string().nullable().optional(),
  messengers: z.array(z.enum(['telegram', 'max'])).optional(),
  position: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(), // data-URL base64
}

export const createUserInput = z.object({
  email: z.string().email(),
  ...personFields,
  role: z.enum(['manager', 'director', 'superuser']).optional(),
}).strict()

export const updateUserInput = z.object({
  ...personFields,
  role: z.enum(['manager', 'director', 'superuser']).optional(),
  is_active: z.boolean().optional(),
}).strict()

// Установка пароля сотрудником по ссылке-приглашению.
export const setPasswordInput = z.object({
  password: z.string().min(8),
}).strict()
