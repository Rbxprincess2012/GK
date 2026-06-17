import { describe, it, expect } from 'vitest'
import { createClient, updateClient } from '../src/validators/client.js'

describe('валидатор клиента — необязательные поля', () => {
  it('null в необязательных полях допустим (приходит из БД при редактировании)', () => {
    const r = updateClient.safeParse({
      legal_name: 'X', kpp: null, ogrn: null, bik: null, bank_name: null,
      legal_address: null, nickname: null, email: null, phone: null,
      bank_account: null, corr_account: null, requires_photo: null,
      default_payment_method: null, inn: null,
    })
    expect(r.success).toBe(true)
  })

  it('пустые строки тоже допустимы', () => {
    const r = updateClient.safeParse({ kpp: '', email: '', bank_account: '', phone: '' })
    expect(r.success).toBe(true)
  })

  it('формат всё ещё проверяется при непустом значении', () => {
    expect(createClient.safeParse({ type: 'ooo', legal_name: 'X', bank_account: '123' }).success).toBe(false)
    expect(createClient.safeParse({ type: 'ooo', legal_name: 'X', email: 'не-почта' }).success).toBe(false)
  })

  it('20-значный счёт и валидная почта проходят', () => {
    const r = createClient.safeParse({
      type: 'ooo', legal_name: 'X', bank_account: '12345678901234567890', email: 'a@b.ru',
    })
    expect(r.success).toBe(true)
  })
})
