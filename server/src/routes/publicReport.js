import { Router } from 'express'
import { publicReport } from '../services/clientMessaging.js'

const r = Router()

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function mediaHtml(a) {
  if (!a.url) {
    if (a.kind === 'text' && a.transcript) return `<blockquote>${esc(a.transcript)}</blockquote>`
    return ''
  }
  if (a.kind === 'video') return `<video src="${esc(a.url)}" controls preload="metadata"></video>`
  if (a.kind === 'audio') return `<audio src="${esc(a.url)}" controls></audio>`
  return `<a href="${esc(a.url)}" target="_blank"><img src="${esc(a.url)}" loading="lazy" alt="пруф"></a>`
}

function sectionHtml(s) {
  const head = s.status === 'done'
    ? `<h3>🟩 ${esc(s.name)} — выполнено</h3>`
    : `<h3 class="fail">⚠ ${esc(s.name)} — не выполнено${s.comment ? `: ${esc(s.comment)}` : ''}</h3>`
  const media = s.attachments.map(mediaHtml).join('')
  return `<section>${head}<div class="grid">${media || '<span class="muted">нет вложений</span>'}</div></section>`
}

function pageHtml(rep) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Putevo · Фотоотчёт по заявке №${esc(rep.number)}</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0b1020;color:#e7ecff;font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:20px}
header{border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:14px;margin-bottom:14px}
h1{font-size:1.3rem;margin:0 0 6px}
.muted{color:#92a2d4}
section{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;margin:12px 0;background:rgba(255,255,255,.02)}
h3{margin:0 0 10px;font-size:1.02rem}
h3.fail{color:#ff8f6b}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
img,video{width:100%;height:120px;object-fit:cover;border-radius:8px;background:#000}
audio{grid-column:1/-1;width:100%}
blockquote{grid-column:1/-1;margin:0;padding:8px 12px;border-left:3px solid #6c5ce7;color:#cdd6ff}
footer{margin-top:18px;color:#92a2d4;font-size:.85rem}
</style></head><body><div class="wrap">
<header>
<h1>Фотоотчёт по заявке №${esc(rep.number)}</h1>
<div class="muted">${esc(rep.client)} · ${esc(rep.date)}</div>
<div class="muted">${esc(rep.address)}</div>
<div class="muted">Водитель: ${esc(rep.driver)}</div>
</header>
${rep.sections.map(sectionHtml).join('')}
<footer>Сумма: ${esc(rep.amount)} · Putevo</footer>
</div></body></html>`
}

r.get('/r/:token', async (req, res, next) => {
  try {
    const rep = await publicReport(req.params.token)
    if (!rep) return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><p>Отчёт не найден.</p>')
    res.type('html').send(pageHtml(rep))
  } catch (e) { next(e) }
})

export default r
