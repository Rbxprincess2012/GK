import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db } from '../src/db.js'
import { resetDb } from './reset.js'
import { findPartyByInn, suggestAddress } from '../src/services/dadata.js'
import { setTokens } from '../src/services/settings.js'

beforeEach(resetDb)
afterAll(() => db.destroy())

const sample = {
  suggestions: [{
    value: 'ООО "МОТОРИКА"',
    data: {
      inn: '7719402047', kpp: '772301001', ogrn: '1157746078984',
      name: { short_with_opf: 'ООО "МОТОРИКА"', full_with_opf: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "МОТОРИКА"' },
      address: { value: 'г Москва, Волгоградский пр-кт', unrestricted_value: '109316, г Москва, Волгоградский пр-кт' },
      management: { name: 'Давидюк Андрей Павлович', post: 'ГЕНЕРАЛЬНЫЙ ДИРЕКТОР' },
    },
  }],
}

describe('dadata findPartyByInn', () => {
  it('нет токена → 400', async () => {
    await expect(findPartyByInn('7719402047', async () => ({ ok: true, json: async () => ({}) })))
      .rejects.toMatchObject({ status: 400 })
  })

  it('маппит реквизиты из ответа DaData; шлёт токен и query', async () => {
    await setTokens({ dadata_token: 'T' })
    let captured
    const fetchImpl = async (url, opts) => { captured = { url, opts }; return { ok: true, json: async () => sample } }
    const r = await findPartyByInn('7719402047', fetchImpl)
    expect(captured.url).toContain('findById/party')
    expect(JSON.parse(captured.opts.body).query).toBe('7719402047')
    expect(captured.opts.headers.Authorization).toBe('Token T')
    expect(r.company_name).toBe('ООО "МОТОРИКА"')
    expect(r.legal_name).toContain('ОБЩЕСТВО')
    expect(r.inn).toBe('7719402047')
    expect(r.kpp).toBe('772301001')
    expect(r.ogrn).toBe('1157746078984')
    expect(r.legal_address).toContain('Москва')
  })

  it('пустой suggestions → null', async () => {
    await setTokens({ dadata_token: 'T' })
    const r = await findPartyByInn('0000', async () => ({ ok: true, json: async () => ({ suggestions: [] }) }))
    expect(r).toBeNull()
  })

  it('ошибка DaData (res.ok=false) → 502', async () => {
    await setTokens({ dadata_token: 'T' })
    await expect(findPartyByInn('7719402047', async () => ({ ok: false, json: async () => ({}) })))
      .rejects.toMatchObject({ status: 502 })
  })
})

const addrSample = {
  suggestions: [{
    value: 'г Сочи, ул Навагинская, д 9',
    data: {
      city: 'Сочи', street_with_type: 'ул Навагинская', house: '9',
      city_district_with_type: 'р-н Центральный', geo_lat: '43.5855', geo_lon: '39.7231',
    },
  }],
}

describe('dadata suggestAddress', () => {
  it('нет токена → 400', async () => {
    await expect(suggestAddress('Сочи', async () => ({ ok: true, json: async () => ({}) })))
      .rejects.toMatchObject({ status: 400 })
  })

  it('маппит адрес + координаты + район; шлёт токен и query', async () => {
    await setTokens({ dadata_token: 'T' })
    let captured
    const fetchImpl = async (url, opts) => { captured = { url, opts }; return { ok: true, json: async () => addrSample } }
    const list = await suggestAddress('Сочи Навагинская 9', fetchImpl)
    expect(captured.url).toContain('suggest/address')
    expect(JSON.parse(captured.opts.body).query).toBe('Сочи Навагинская 9')
    expect(captured.opts.headers.Authorization).toBe('Token T')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      value: 'г Сочи, ул Навагинская, д 9', city: 'Сочи', street: 'ул Навагинская',
      house: '9', district: 'р-н Центральный', lat: 43.5855, lng: 39.7231,
    })
  })

  it('пустой suggestions → []', async () => {
    await setTokens({ dadata_token: 'T' })
    const r = await suggestAddress('нет', async () => ({ ok: true, json: async () => ({ suggestions: [] }) }))
    expect(r).toEqual([])
  })

  it('ошибка DaData → 502', async () => {
    await setTokens({ dadata_token: 'T' })
    await expect(suggestAddress('x', async () => ({ ok: false, json: async () => ({}) })))
      .rejects.toMatchObject({ status: 502 })
  })
})
