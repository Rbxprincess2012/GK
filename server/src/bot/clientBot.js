import { Bot } from 'grammy'
import { bindByCode } from '../services/clientRecipients.js'
import { bindPersonByCode } from '../services/trustedPersonChannels.js'

// Клиентский бот: ТОЛЬКО онбординг получателей отчётов. Отправку делает api.
//  • /start <code>   в личке  → привязать личный чат клиента (kind 'dm')
//  • /start p<code>  в личке  → привязать личный чат доверенного лица
//  • /bind  <code>   в группе → привязать группу (kind 'group')
// title бот подставляет сам (имя/@username или название группы).
const personTitle = (from) => [from?.first_name, from?.username && `@${from.username}`].filter(Boolean).join(' ')
// Имя доверенного лица для обращения: храним «Фамилия Имя» — берём часть после первой (фамилии).
// Фамилия в приветствии не нужна. Без пробела — используем как есть.
const addressName = (full) => {
  const parts = String(full || '').trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || '')
}

export function createClientBot(token) {
  const bot = new Bot(token)

  bot.command('start', async (ctx) => {
    const code = (ctx.match || '').trim()
    if (!code) return ctx.reply('Это бот уведомлений о выполнении заявок. Откройте персональную ссылку, которую дал менеджер.')
    // Префикс 'p' → код доверенного лица; иначе — получатель клиента.
    if (/^p\d+$/.test(code)) {
      const r = await bindPersonByCode(code.slice(1), { chat_id: ctx.chat.id })
      return ctx.reply(r ? `Готово, ${addressName(r.name)}! Сюда будут приходить отчёты о выполнении заявок по вашим объектам.` : 'Ссылка недействительна или уже использована.')
    }
    const r = await bindByCode(code, { chat_id: ctx.chat.id, kind: 'dm', title: personTitle(ctx.from) })
    return ctx.reply(r ? 'Готово! Сюда будут приходить отчёты о выполнении ваших заявок.' : 'Ссылка недействительна или уже использована.')
  })

  bot.command('bind', async (ctx) => {
    const code = (ctx.match || '').trim()
    if (!code) return ctx.reply('Укажите код: /bind <код от менеджера>.')
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup'
    try {
      const r = await bindByCode(code, {
        chat_id: ctx.chat.id,
        kind: isGroup ? 'group' : 'dm',
        title: isGroup ? ctx.chat.title : personTitle(ctx.from),
      })
      if (r?.id) return ctx.reply('✅ Привязано — сюда будут приходить отчёты о выполнении.')
      if (r?.error === 'chat_taken') {
        return ctx.reply(`Эта группа уже привязана к другому клиенту${r.title ? ` («${r.title}»)` : ''}. Используйте отдельную группу для этого заказчика (или отвяжите её у прежнего в админке).`)
      }
      return ctx.reply('Код недействителен или уже использован.')
    } catch (e) {
      console.error('[client-bot] bind error:', e)
      return ctx.reply('Не удалось привязать — попробуйте ещё раз или сообщите менеджеру.')
    }
  })

  return bot
}
