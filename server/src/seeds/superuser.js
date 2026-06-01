// Бутстрап суперпользователя. Креды берём из env (SUPERUSER_EMAIL/PASSWORD)
// или дефолтные для дев-старта. Запуск: npm run seed:superuser
import { db } from '../db.js'
import { config } from '../config.js'
import { hashPassword } from '../lib/password.js'

async function main() {
  const email = config.SUPERUSER_EMAIL || 'clockerinfo@gmail.com'
  const password = config.SUPERUSER_PASSWORD || 'super12345'

  const existing = await db('users').where({ email }).first()
  if (existing) {
    await db('users').where({ id: existing.id })
      .update({ role: 'superuser', is_active: true, password_hash: hashPassword(password) })
    console.log(`Суперюзер обновлён: ${email} / ${password}`)
  } else {
    await db('users').insert({
      email, password_hash: hashPassword(password),
      first_name: 'Super', last_name: 'User', role: 'superuser', is_active: true,
    })
    console.log(`Суперюзер создан: ${email} / ${password}`)
  }
  console.log('⚠️  Смените пароль после первого входа (env SUPERUSER_PASSWORD).')
  await db.destroy()
}

main().catch((e) => { console.error(e); process.exit(1) })
