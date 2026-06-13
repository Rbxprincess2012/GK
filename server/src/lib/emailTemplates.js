import { config } from '../config.js'

const APP_NAME = 'Putevo'

// База фронта: в проде APP_URL (напр. https://putevo.su) на корне, в dev — локальный Vite.
// SPA переехала с /admin на корень, поэтому префикс /admin больше не добавляем.
function adminBase() {
  const b = config.APP_URL ? config.APP_URL.replace(/\/+$/, '') : null
  return b || 'http://localhost:5174'
}

// Ссылка, по которой сотрудник задаёт пароль.
export function inviteLink(token) {
  return `${adminBase()}/set-password?token=${token}`
}

function compose(lines) {
  return lines.filter((l) => l !== null && l !== undefined).join('\n')
}

// Создан аккаунт — приглашение задать пароль (директор указал только почту).
export function accountInvite({ email, token }) {
  return {
    template: 'account_invite',
    subject: `${APP_NAME}: приглашение в систему`,
    body: compose([
      'Здравствуйте!',
      '',
      `Для вас создан аккаунт в системе ${APP_NAME}.`,
      `Логин (email): ${email}`,
      '',
      'Чтобы задать пароль и войти, перейдите по ссылке:',
      inviteLink(token),
      '',
      'Ссылка действует ограниченное время. Если вы её не запрашивали — проигнорируйте письмо.',
    ]),
  }
}

// Сброс пароля — ссылка для установки нового.
export function passwordResetLink({ email, token }) {
  return {
    template: 'password_reset',
    subject: `${APP_NAME}: смена пароля`,
    body: compose([
      'Здравствуйте!',
      '',
      `Запрошена смена пароля для входа в ${APP_NAME}.`,
      `Логин (email): ${email}`,
      '',
      'Чтобы задать новый пароль, перейдите по ссылке:',
      inviteLink(token),
      '',
      'Ссылка действует ограниченное время. Если это были не вы — сообщите администратору.',
    ]),
  }
}
