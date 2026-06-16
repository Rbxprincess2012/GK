import { z } from 'zod'

// Пустую строку считаем «не указано» — поле необязательное, проверку формата пропускаем.
const optionalStr = z.string().optional()
// Счёт (расч./корр.) — ровно 20 цифр, если указан; иначе пусто.
const account = z.union([z.literal(''), z.string().regex(/^\d{20}$/, 'Счёт должен содержать 20 цифр')]).optional()
const optionalEmail = z.union([z.literal(''), z.string().email('Некорректный адрес почты')]).optional()

const base = {
  type: z.enum(['ooo', 'ip']),
  legal_name: z.string().min(1, 'Укажите наименование'),
  inn: optionalStr,
  kpp: optionalStr,
  ogrn: optionalStr,
  legal_address: optionalStr,
  bank_name: optionalStr,
  bank_account: account,
  bik: optionalStr,
  corr_account: account,
  nickname: optionalStr,
  group_id: z.number().int().nullable().optional(),
  email: optionalEmail,
  phone: optionalStr,
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
