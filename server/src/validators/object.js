import { z } from 'zod'

const base = {
  client_id: z.number().int(),
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
}

export const objectCreate = z.object(base).strict()
export const objectUpdate = z.object(base).partial().strict()
