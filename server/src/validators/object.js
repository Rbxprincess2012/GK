import { z } from 'zod'

const base = {
  client_id: z.number().int(),
  city: z.string().nullable().optional(),
  street_id: z.number().int().nullable().optional(),
  district_id: z.number().int().nullable().optional(),
  address_raw: z.string().optional(),
  house: z.string().optional(),
  building: z.string().optional(),
  informal_name: z.string().optional(),
  requires_photo: z.boolean().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  note: z.string().optional(),
  // Привязки доверенных лиц: лицо клиента + уровень (section_id = участок или null = весь объект).
  // Передаётся полностью — заменяет набор целиком.
  trusted_links: z.array(z.object({
    trusted_person_id: z.number().int(),
    section_id: z.number().int().nullable().optional(),
  })).optional(),
}

export const objectCreate = z.object(base).strict()
export const objectUpdate = z.object(base).partial().strict()
