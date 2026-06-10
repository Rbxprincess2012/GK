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
  // Адрес фронта — для ссылки на вход в письмах (напр. https://putevo.su)
  APP_URL: z.string().optional(),
  // Почтовая служба (подключим позже). Пока пусто — письма копятся в email_outbox.
  MAIL_FROM: z.string().optional(),          // напр. "Putevo <noreply@putevo.su>"
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  // Водительский Telegram-бот (отдельный токен от клиентского!).
  DRIVER_BOT_TOKEN: z.string().optional(),
  DRIVER_BOT_USERNAME: z.string().optional(),   // без @, для ссылок t.me/<username>?start=<code>
  // Каталог хранения медиа-пруфа (скачиваем из Telegram). Volume на VPS.
  MEDIA_DIR: z.string().default('./media'),
})

export const config = schema.parse(process.env)

// Почта реально отправляется, только когда задан SMTP-хост (иначе письма копятся в очереди).
export const mailEnabled = Boolean(config.SMTP_HOST)

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
