import { z } from 'zod'

export const createOrderInput = z.object({
  object_id: z.number().int(),
  trusted_person_id: z.number().int().nullable().optional(),
  payment_method: z.enum(['cashless', 'cash']).optional(),
  amount: z.number().nonnegative().nullable().optional(),
  desired_date: z.string().optional(),
  desired_time: z.string().optional(),
  note: z.string().optional(),
  // 'pending_review' — черновик от бота (без номера до accept); по умолчанию 'new'
  status: z.enum(['new', 'pending_review']).optional(),
  // Позиции теперь НЕ обязательны: входящая заявка = объект+дата+комментарий,
  // детали работы пишутся в note. Структурные позиции оставлены опционально.
  items: z.array(z.object({
    action: z.enum(['place', 'replace', 'haul']),
    // участок объекта (если есть); null = весь объект
    section_id: z.number().int().nullable().optional(),
    // тип контейнера и класс отходов временно «на заглушке» — необязательны
    container_type_id: z.number().int().nullable().optional(),
    quantity: z.number().int().positive(),
    waste_class: z.enum(['4', '5']).nullable().optional(),
    requested_container_ids: z.array(z.number().int()).optional(),
  })).optional(),
}).strict()

// Ручное редактирование заявки менеджером (PATCH). Все поля опциональны;
// items, если переданы, ЗАМЕНЯЮТ позиции целиком (только пока нет движений контейнеров).
export const updateOrderInput = z.object({
  trusted_person_id: z.number().int().nullable().optional(),
  payment_method: z.enum(['cashless', 'cash']).nullable().optional(),
  amount: z.number().nonnegative().nullable().optional(),
  desired_date: z.string().nullable().optional(),
  desired_time: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  items: z.array(z.object({
    action: z.enum(['place', 'replace', 'haul']),
    // участок объекта (если есть); null = весь объект
    section_id: z.number().int().nullable().optional(),
    // тип контейнера и класс отходов временно «на заглушке» — необязательны
    container_type_id: z.number().int().nullable().optional(),
    quantity: z.number().int().positive(),
    waste_class: z.enum(['4', '5']).nullable().optional(),
  })).min(1).optional(),
}).strict()

const attachment = z.object({
  kind: z.enum(['photo', 'audio', 'text']),
  file_url: z.string().optional(),
  transcript: z.string().optional(),
  author_driver_id: z.number().int().nullable().optional(),
})

export const driverConfirmInput = z.object({
  attachments: z.array(attachment).optional(),
}).strict()

export const failInput = z.object({
  reason: z.string().optional(),
}).strict()

export const sendToReviewInput = z.object({
  shift_date: z.string(),
  shift_type: z.enum(['day', 'night']),
}).strict()

export const moveDriverInput = z.object({
  driver_id: z.number().int(),
}).strict()

export const assignInput = z.object({
  driver_id: z.number().int(),
  shift_date: z.string(),
  shift_type: z.enum(['day', 'night']),
  vehicle_id: z.number().int().nullable().optional(),
}).strict()

export const completeInput = z.object({
  movements: z.array(z.object({
    container_id: z.number().int(),
    direction: z.enum(['delivered', 'picked_up']),
  })).optional(),
  attachments: z.array(z.object({
    kind: z.enum(['photo', 'audio', 'text']),
    file_url: z.string().optional(),
    transcript: z.string().optional(),
    author_driver_id: z.number().int().nullable().optional(),
  })).optional(),
}).strict()
