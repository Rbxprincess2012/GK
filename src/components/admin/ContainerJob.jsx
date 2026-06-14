import { ArrowRight, ArrowLeft, ArrowLeftRight } from 'lucide-react'
import { containerJob, ACTION, plural } from '@/lib/orderUi'

// Задание водителю в ДВА УРОВНЯ:
//  1) по участкам: стрелка действия (→ установить / ⇄ заменить / ← забрать) +
//     «кол-во действие» + «📍 участок · №…». Все три части — в общих колонках
//     грида (display:contents), поэтому стрелки и пины 📍 выровнены друг под другом.
//  2) логистика: 📦…📦 (число коробок = сколько пустых взять с базы) + «N рейсов».
// Если позиций нет (карточка списка) — уровень 1 свёрнут в «N забрать».
const ACTION_ICON = { place: ArrowRight, replace: ArrowLeftRight, haul: ArrowLeft }
const BASE = '📦'
// Число коробок = количество пустых (до 6 — повтором, дальше «📦×N»).
function baseEmoji(n) { return n <= 0 ? '' : n <= 6 ? BASE.repeat(n) : `${BASE}×${n}` }
// «Участок 58» → «58»: пин (📍) заменяет слово «участок». Прочие названия — как есть.
function sectionPin(name) { return String(name).replace(/^\s*участок\s*/i, '').trim() || name }

function ActionIcon({ action }) {
  const Ico = ACTION_ICON[action]
  return Ico ? <Ico size={15} strokeWidth={2.5} /> : null
}

export function ContainerJob({ o, showTrips = true }) {
  const items = Array.isArray(o?.items) ? o.items : []
  const j = containerJob(o) // { empties, fulls, trips, has }
  if (!j.has) return null

  return (
    <div className="a-cjob">
      {/* Уровень 1 — по участкам (или агрегат «N забрать» без позиций) */}
      {items.length > 0
        ? items.map((it, i) => (
            <div key={i} className="a-cjob-task">
              <span className="a-cjob-ico" title={ACTION[it.action] || it.action}><ActionIcon action={it.action} /></span>
              <span className="a-cjob-act">{it.quantity} {(ACTION[it.action] || it.action).toLowerCase()}</span>
              <span className="a-cjob-detail">
                {it.section_name ? <>📍 {sectionPin(it.section_name)}</> : null}
                {it.container_numbers ? <span className="a-cjob-cno">{it.section_name ? ' · ' : ''}№{it.container_numbers}</span> : null}
              </span>
            </div>
          ))
        : j.fulls > 0 && (
            <div className="a-cjob-task">
              <span className="a-cjob-ico" title="Забрать"><ActionIcon action="haul" /></span>
              <span className="a-cjob-act">{j.fulls} забрать</span>
              <span className="a-cjob-detail" />
            </div>
          )}

      {/* Уровень 2 — логистика: число коробок = пустые с базы, + рейсы (всегда). */}
      {(j.empties > 0 || showTrips) && (
        <div className="a-cjob-logi" title="Сколько пустых взять с базы и число заездов">
          {j.empties > 0 && (
            <><span className="a-cjob-emo">{baseEmoji(j.empties)}</span> <span className="a-cjob-base">взять с базы</span></>
          )}
          {showTrips && (
            <span className="a-cjob-trips">{j.empties > 0 ? ' · ' : ''}{j.trips} {plural(j.trips, 'рейс', 'рейса', 'рейсов')}</span>
          )}
        </div>
      )}
    </div>
  )
}
