import { Bot } from '../lib/maxgram.js'
import { bindByCode } from '../services/clientRecipients.js'
import { bindPersonByCode } from '../services/trustedPersonChannels.js'

// Клиентский MAX-бот: ТОЛЬКО онбординг получателей отчётов (зеркало bot/clientBot.js). Отправку
// делает api. Канал — 'max'. Привязка по chat_id из апдейта (bot_started.chat_id / recipient).
//  • deep-link payload <code>   (личка) → получатель клиента (kind 'dm')
//  • deep-link payload p<code>  (личка) → доверенное лицо
//  • /bind <code>               (группа) → получатель-группа (kind 'group')
const personTitle = (from) => [from?.first_name, from?.username && `@${from.username}`].filter(Boolean).join(' ')
// Имя для обращения: «Фамилия Имя» → часть после фамилии (фамилия в приветствии не нужна).
const addressName = (full) => {
  const parts = String(full || '').trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || '')
}

export function createMaxClientBot(token) {
  const bot = new Bot(token)

  bot.command('start', async (ctx) => {
    const code = (ctx.match || '').trim()
    if (!code) return ctx.reply('Это бот уведомлений о выполнении заявок. Откройте персональную ссылку, которую дал менеджер.')
    // Префикс 'p' → код доверенного лица; иначе — получатель клиента.
    if (/^p\d+$/.test(code)) {
      const r = await bindPersonByCode(code.slice(1), { chat_id: ctx.chat.id, channel: 'max' })
      return ctx.reply(r ? `Готово, ${addressName(r.name)}! Сюда будут приходить отчёты о выполнении заявок по вашим объектам.` : 'Ссылка недействительна или уже использована.')
    }
    const r = await bindByCode(code, { chat_id: ctx.chat.id, kind: 'dm', title: personTitle(ctx.from), channel: 'max' })
    return ctx.reply(r ? 'Готово! Сюда будут приходить отчёты о выполнении ваших заявок.' : 'Ссылка недействительна или уже использована.')
  })

  // Бота в группу добавляет менеджер — НЕ шумим авто-сообщением «я бот…». Требование «сделать
  // админом + /bind» менеджер видит в инструкции админки. (Апдейт bot_added намеренно не обрабатываем.)
  bot.command('bind', async (ctx) => {
    const code = (ctx.match || '').trim()
    if (!code) return ctx.reply('Укажите код: /bind <код от менеджера>.')
    // MAX: личный диалог — chat_type 'dialog'; всё иное (chat/channel) считаем группой.
    const isGroup = ctx.chat?.type && ctx.chat.type !== 'dialog'
    try {
      const r = await bindByCode(code, {
        chat_id: ctx.chat.id,
        kind: isGroup ? 'group' : 'dm',
        title: isGroup ? (ctx.chat.title || 'Группа') : personTitle(ctx.from),
        channel: 'max',
      })
      if (r?.id) return ctx.reply('✅ Привязано — сюда будут приходить отчёты о выполнении.')
      if (r?.error === 'chat_taken') {
        return ctx.reply(`Эта группа уже привязана к другому клиенту${r.title ? ` («${r.title}»)` : ''}. Используйте отдельную группу для этого заказчика (или отвяжите её у прежнего в админке).`)
      }
      return ctx.reply('Код недействителен или уже использован.')
    } catch (e) {
      console.error('[max-client-bot] bind error:', e)
      return ctx.reply('Не удалось привязать — попробуйте ещё раз или сообщите менеджеру.')
    }
  })

  return bot
}
