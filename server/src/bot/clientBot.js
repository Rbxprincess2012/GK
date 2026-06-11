import { Bot } from 'grammy'
import { bindByCode } from '../services/clientRecipients.js'

// Клиентский бот: ТОЛЬКО онбординг получателей отчётов. Отправку делает api.
//  • /start <code> в личке  → привязать личный чат (kind 'dm')
//  • /bind  <code> в группе → привязать группу (kind 'group')
// title бот подставляет сам (имя/@username или название группы).
const personTitle = (from) => [from?.first_name, from?.username && `@${from.username}`].filter(Boolean).join(' ')

export function createClientBot(token) {
  const bot = new Bot(token)

  bot.command('start', async (ctx) => {
    const code = (ctx.match || '').trim()
    if (!code) return ctx.reply('Это бот уведомлений о выполнении заявок. Откройте персональную ссылку, которую дал менеджер.')
    const r = await bindByCode(code, { chat_id: ctx.chat.id, kind: 'dm', title: personTitle(ctx.from) })
    return ctx.reply(r ? 'Готово! Сюда будут приходить отчёты о выполнении ваших заявок.' : 'Ссылка недействительна или уже использована.')
  })

  bot.command('bind', async (ctx) => {
    const code = (ctx.match || '').trim()
    if (!code) return ctx.reply('Укажите код: /bind <код от менеджера>.')
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup'
    const r = await bindByCode(code, {
      chat_id: ctx.chat.id,
      kind: isGroup ? 'group' : 'dm',
      title: isGroup ? ctx.chat.title : personTitle(ctx.from),
    })
    return ctx.reply(r ? '✅ Привязано — сюда будут приходить отчёты о выполнении.' : 'Код недействителен или уже использован.')
  })

  return bot
}
