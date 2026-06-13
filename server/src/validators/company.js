import { z } from 'zod'

// Реквизиты компании-клиента + email директора. Все поля опциональны (карточку
// можно сохранять по мере заполнения). Зеркало settings.orgInput + director_email.
const fields = {
  company_name: z.string().optional(),
  legal_name: z.string().optional(),
  inn: z.string().optional(),
  kpp: z.string().optional(),
  ogrn: z.string().optional(),
  legal_address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account: z.string().optional(),
  bik: z.string().optional(),
  corr_account: z.string().optional(),
  director_email: z.string().optional(),
}

export const createCompany = z.object(fields).strict()
export const updateCompany = z.object(fields).strict()
