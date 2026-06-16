import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useToast } from '@/components/admin/Toast'

// Раздел супера «Цены» — редактор настройки settings.pricing. Единый источник:
// отсюда считаются кнопки продления в «Учёте пользователей» и публичная витрина
// лендинга (GET /public/pricing).

const fmt = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0))

function calc(base, months, discount) {
  const amount = Math.round(Number(base) * Number(months) * (1 - Number(discount) / 100))
  return { amount, per_month: months ? Math.round(amount / months) : amount }
}

export default function Pricing() {
  const toast = useToast()
  const [p, setP] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { api.get('/pricing').then(({ data }) => setP(data)).catch(() => {}) }, [])

  if (!p) return <div className="a-page" style={{ maxWidth: 760 }}><div className="a-muted" style={{ padding: 24 }}>Загрузка…</div></div>

  const setNum = (k) => (e) => setP((s) => ({ ...s, [k]: e.target.value === '' ? '' : Number(e.target.value) }))
  const setTierDiscount = (i) => (e) => setP((s) => ({
    ...s, tiers: s.tiers.map((t, j) => j === i ? { ...t, discount: e.target.value === '' ? 0 : Number(e.target.value) } : t),
  }))

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        base_month: Number(p.base_month) || 0,
        trial_days: Number(p.trial_days) || 0,
        tiers: p.tiers.map((t) => ({ months: Number(t.months), discount: Number(t.discount) || 0 })),
      }
      const { data } = await api.patch('/pricing', payload)
      setP(data); toast.success('Цены сохранены')
    } catch { toast.error('Не удалось сохранить') } finally { setSaving(false) }
  }

  return (
    <div className="a-page" style={{ maxWidth: 760 }}>
      <div className="a-page-header"><h2>Цены</h2></div>
      <div className="a-note" style={{ marginBottom: 16 }}>
        Базовая цена и скидки за период. Отсюда считаются кнопки продления подписки в «Учёте пользователей»
        и витрина на лендинге. Длина пробного периода применяется к новым компаниям при первом входе.
      </div>

      <div className="a-card">
        <div className="a-section-title" style={{ marginTop: 0 }}>Основное</div>
        <div className="a-field-row">
          <label className="a-field"><span>Базовая цена за месяц, ₽</span>
            <input className="a-input" type="number" min="0" value={p.base_month} onChange={setNum('base_month')} />
          </label>
          <label className="a-field"><span>Пробный период, дней</span>
            <input className="a-input" type="number" min="0" value={p.trial_days} onChange={setNum('trial_days')} />
          </label>
        </div>

        <div className="a-section-title">Тарифы и скидки</div>
        <div className="a-objrow a-objrow--head" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
          <span>Период</span><span>Скидка, %</span><span>Цена</span><span>Эффект./мес</span>
        </div>
        {p.tiers.map((t, i) => {
          const c = calc(p.base_month, t.months, t.discount)
          return (
            <div key={t.months} className="a-objrow" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>{t.months} мес</span>
              <span>
                <input className="a-input" type="number" min="0" max="100" value={t.discount}
                  onChange={setTierDiscount(i)} style={{ width: 90 }} />
              </span>
              <span>{fmt(c.amount)} ₽</span>
              <span className="a-muted">{fmt(c.per_month)} ₽/мес</span>
            </div>
          )
        })}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="a-btn a-btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
