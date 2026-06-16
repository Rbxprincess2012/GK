import { getSetting, setSetting } from './settings.js'

// Цены и скидки подписки (раздел супера «Цены»). Единый источник правды:
// кнопки продления в «Учёте пользователей», страница «Цены» и публичный эндпоинт
// для лендинга считают из настройки settings.pricing. При мультитенанте станет
// per-tenant (план на компанию) — сейчас одна на инсталляцию.

const DEFAULTS = {
  currency: 'RUB',
  base_month: 5000,   // базовая цена за месяц, ₽
  trial_days: 7,      // длина пробного периода (стартует с первого входа)
  tiers: [
    { months: 1, discount: 0 },
    { months: 3, discount: 5 },
    { months: 6, discount: 10 },
    { months: 12, discount: 20 },
  ],
}

export async function getPricing() {
  const saved = (await getSetting('pricing')) || {}
  return {
    currency: saved.currency || DEFAULTS.currency,
    base_month: Number.isFinite(saved.base_month) ? saved.base_month : DEFAULTS.base_month,
    trial_days: Number.isFinite(saved.trial_days) ? saved.trial_days : DEFAULTS.trial_days,
    tiers: Array.isArray(saved.tiers) && saved.tiers.length ? saved.tiers : DEFAULTS.tiers,
  }
}

export async function setPricing(patch) {
  const cur = await getPricing()
  return setSetting('pricing', { ...cur, ...patch })
}

// Расчёт стоимости периода: цена со скидкой тарифа + эффективная цена за месяц.
export function quote(pricing, months) {
  const tier = (pricing.tiers || []).find((t) => Number(t.months) === Number(months))
  const discount = tier ? Number(tier.discount) || 0 : 0
  const gross = Number(pricing.base_month) * Number(months)
  const amount = Math.round(gross * (1 - discount / 100))
  return {
    months: Number(months),
    discount_pct: discount,
    amount,
    per_month: months ? Math.round(amount / months) : amount,
    currency: pricing.currency,
  }
}

export async function quoteFor(months) {
  return quote(await getPricing(), months)
}

// Готовая витрина для страницы «Цены» и публичного эндпоинта лендинга.
export async function publicTable() {
  const p = await getPricing()
  return {
    currency: p.currency,
    base_month: p.base_month,
    trial_days: p.trial_days,
    tiers: (p.tiers || []).map((t) => quote(p, t.months)),
  }
}
