import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  PGHOST: z.string().min(1),
  PGPORT: z.coerce.number().default(5432),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string().min(1),
  PGDATABASE: z.string().min(1),
  PGSSL: z.enum(['require', 'disable']).default('require'),
  NODE_ENV: z.string().default('development'),
  // Этап 2: сервисный токен для маршрутов, дёргаемых n8n (если пуст — guard отключён в dev)
  SERVICE_TOKEN: z.string().optional(),
  // Куда бэкенд может слать исходящие события (опц.; основной путь — outbox-поллинг)
  N8N_WEBHOOK_URL: z.string().optional(),
  // Авторизация пользователей (JWT). В проде ОБЯЗАТЕЛЬНО задать свой секрет.
  AUTH_SECRET: z.string().default('dev-insecure-secret-change-me'),
  // Бутстрап суперпользователя (для seed:superuser)
  SUPERUSER_EMAIL: z.string().optional(),
  SUPERUSER_PASSWORD: z.string().optional(),
  // CORS: список разрешённых origin через запятую (для прода — домен фронта). Пусто = разрешить любой.
  CORS_ORIGIN: z.string().optional(),
})

export const config = schema.parse(process.env)

// готовое соединение для knex (host/port/user/password/database + ssl)
export function pgConnection() {
  return {
    host: config.PGHOST,
    port: config.PGPORT,
    user: config.PGUSER,
    password: config.PGPASSWORD,
    database: config.PGDATABASE,
    ssl: config.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
  }
}
