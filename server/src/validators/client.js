import { z } from 'zod'

const base = {
  type: z.enum(['ooo', 'ip']),
  legal_name: z.string().min(1),
  inn: z.string().optional(),
  kpp: z.string().optional(),
  ogrn: z.string().optional(),
  legal_address: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account: z.string().optional(),
  bik: z.string().optional(),
  corr_account: z.string().optional(),
  nickname: z.string().optional(),
  group_id: z.number().int().nullable().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  default_payment_method: z.enum(['cashless', 'cash']).optional(),
  requires_photo: z.boolean().optional(),
  // Адреса общих чатов клиента по мессенджерам (ручной ввод) — куда слать отчёты.
  chats: z.object({
    telegram: z.string().nullable().optional(),
    max: z.string().nullable().optional(),
  }).strict().optional(),
}

export const createClient = z.object(base).strict()
export const updateClient = z.object(base).partial().strict()
