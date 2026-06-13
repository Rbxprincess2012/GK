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

// Индивидуальные права на пункты сайдбара (только для роли manager).
// null → без ограничений (всё по роли); массив ключей-маршрутов → только они.
const navPermissions = z.array(z.string()).nullable().optional()

export const createUserInput = z.object({
  email: z.string().email(),
  ...personFields,
  role: z.enum(['manager', 'director', 'superuser']).optional(),
  nav_permissions: navPermissions,
}).strict()

export const updateUserInput = z.object({
  ...personFields,
  role: z.enum(['manager', 'director', 'superuser']).optional(),
  is_active: z.boolean().optional(),
  nav_permissions: navPermissions,
}).strict()

// Установка пароля сотрудником по ссылке-приглашению.
export const setPasswordInput = z.object({
  password: z.string().min(8),
}).strict()

// ───── Саморегистрация по коду (эпик #3) ─────

export const registerInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
}).strict()

export const verifyCodeInput = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
}).strict()

export const forgotInput = z.object({
  email: z.string().email(),
}).strict()

export const resetCodeInput = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8),
}).strict()
