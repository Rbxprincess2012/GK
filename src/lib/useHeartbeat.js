import { useEffect } from 'react'
import api from './api'

// Журнал посещений: пока вкладка открыта и активна, раз в INTERVAL шлём heartbeat,
// чтобы сервер посчитал время на сервисе (sum(last_seen - started)). На скрытой
// вкладке пинги останавливаются — простой не засчитывается. id сессии берётся из JWT.
const INTERVAL = 60_000

export function useHeartbeat() {
  useEffect(() => {
    let timer = null
    const ping = () => {
      if (document.visibilityState !== 'visible') return
      if (!localStorage.getItem('token')) return
      api.post('/sessions/ping').catch(() => {})
    }
    const start = () => { if (!timer) { ping(); timer = setInterval(ping, INTERVAL) } }
    const stop = () => { if (timer) { clearInterval(timer); timer = null } }
    const onVis = () => { if (document.visibilityState === 'visible') start(); else stop() }
    document.addEventListener('visibilitychange', onVis)
    start()
    return () => { document.removeEventListener('visibilitychange', onVis); stop() }
  }, [])
}
