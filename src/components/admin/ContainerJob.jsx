import { containerJob, ACTION, plural } from '@/lib/orderUi'

// Задание водителю в ДВА УРОВНЯ:
//  1) по участкам: «📍 58 — 2 забрать» (кол-во перед действием строчными; пин 📍
//     заменяет слово «участок» в названии);
//  2) команда на базу — «С базы взять: 📦×N» (без эмодзи-префикса и без «(N пустых)»,
//     с отступом от участков); N = Поставить + Заменить (по всем участкам). Число 📦 = количество.
//  + мелкой строкой «N рейсов».
// Если позиций нет (карточка списка) — уровень 1 свёрнут в текст «N забрать».
const BASE = '📦'
function baseEmoji(n) { return n <= 0 ? '' : n <= 6 ? BASE.repeat(n) : `${BASE}×${n}` }
// «Участок 58» → «58»: пин (📍) заменяет слово «участок». Прочие названия — как есть.
function sectionPin(name) { return String(name).replace(/^\s*участок\s*/i, '').trim() || name }

export function ContainerJob({ o, showTrips = true }) {
  const items = Array.isArray(o?.items) ? o.items : []
  const j = containerJob(o) // { empties, fulls, trips, has }
  if (!j.has) return null

  return (
    <div className="a-cjob">
      {/* Уровень 1 — по участкам текстом (или агрегат «Забрать N» без позиций) */}
      {items.length > 0
        ? items.map((it, i) => (
            <div key={i} className={'a-cjob-task' + (it.section_name ? ' a-cjob-task--grid' : '')}>
              {it.section_name && <span className="a-cjob-sec-label">📍 {sectionPin(it.section_name)}</span>}
              <span className="a-cjob-act">{it.quantity} {(ACTION[it.action] || it.action).toLowerCase()}</span>
            </div>
          ))
        : j.fulls > 0 && <div className="a-cjob-task">{j.fulls} забрать</div>}

      {/* Уровень 2 — команда на базу (единственные эмодзи) */}
      {j.empties > 0 && (
        <div className="a-cjob-base" title="Сколько пустых контейнеров взять с базы перед выездом">
          С базы взять: <span className="a-cjob-emo">{baseEmoji(j.empties)}</span>
        </div>
      )}

      {showTrips && j.trips > 1 && (
        <div className="a-cjob-trips" title="Заездов по вместимости машины (полный — 1 за рейс)">
          {j.trips} {plural(j.trips, 'рейс', 'рейса', 'рейсов')}
        </div>
      )}
    </div>
  )
}
