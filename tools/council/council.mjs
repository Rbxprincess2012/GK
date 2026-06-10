#!/usr/bin/env node
// LLM-совет для вопросов по проекту Putevo.
// Идея (по мотивам karpathy/llm-council): один вопрос → несколько моделей дают
// мнения → анонимно рецензируют друг друга → «Председатель» сводит финал.
//
// Запуск (PowerShell):
//   $env:OPENROUTER_API_KEY="sk-or-..."   # или положить в tools/council/.env
//   node tools/council/council.mjs "Как лучше организовать роли менеджеров?"
//
// Флаги:
//   -f, --file <path>   добавить файл проекта в контекст (можно несколько раз)
//   --no-context        не подмешивать CLAUDE.md
//   --models a,b,c      переопределить список моделей совета
//   --chairman <slug>   переопределить модель-председателя

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')

// ── Настройки совета (правьте под себя) ──────────────────────────────────────
// Слаги моделей OpenRouter. Если какой-то слаг устарел — этот участник просто
// «не явится», остальные отработают. Актуальный список: https://openrouter.ai/models
const COUNCIL = [
  'openai/gpt-4o',
  'google/gemini-1.5-pro',
  'anthropic/claude-3.5-sonnet',
  'x-ai/grok-2-1212',
]
const CHAIRMAN = 'openai/gpt-4o'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// ── Мини-загрузчик .env (без зависимостей) ───────────────────────────────────
async function loadEnv() {
  const envPath = join(__dirname, '.env')
  if (!existsSync(envPath)) return
  const text = await readFile(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

// ── Разбор аргументов ────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { files: [], noContext: false, models: null, chairman: null, question: '' }
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-f' || a === '--file') out.files.push(argv[++i])
    else if (a === '--no-context') out.noContext = true
    else if (a === '--models') out.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--chairman') out.chairman = argv[++i]
    else rest.push(a)
  }
  out.question = rest.join(' ').trim()
  return out
}

// ── Контекст проекта ─────────────────────────────────────────────────────────
async function buildContext({ files, noContext }) {
  const parts = []
  if (!noContext) {
    const claude = join(PROJECT_ROOT, 'CLAUDE.md')
    if (existsSync(claude)) parts.push(`# CLAUDE.md\n${await readFile(claude, 'utf8')}`)
  }
  for (const f of files) {
    const p = resolve(PROJECT_ROOT, f)
    if (!existsSync(p)) { console.warn(`⚠️  файл не найден: ${f}`); continue }
    parts.push(`# ${f}\n${await readFile(p, 'utf8')}`)
  }
  return parts.join('\n\n---\n\n')
}

// ── Вызов одной модели через OpenRouter ──────────────────────────────────────
async function callModel(model, messages) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://putevo.su',
      'X-Title': 'Putevo Council',
    },
    body: JSON.stringify({ model, messages }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || '(пустой ответ)'
}

// ── Стадия 1: первые мнения (параллельно) ────────────────────────────────────
async function stageOpinions(models, question, context) {
  const sys = 'Ты — эксперт-консультант по разработке ПО. Отвечай по делу, конкретно, '
    + 'с учётом приведённого контекста проекта. Если контекста не хватает — скажи об этом.'
  const user = context
    ? `Контекст проекта:\n\n${context}\n\n---\n\nВопрос: ${question}`
    : `Вопрос: ${question}`
  const results = await Promise.all(models.map(async (model) => {
    try {
      const answer = await callModel(model, [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ])
      return { model, answer, ok: true }
    } catch (e) {
      return { model, answer: `(ошибка: ${e.message})`, ok: false }
    }
  }))
  return results
}

// ── Стадия 2: анонимная перекрёстная оценка ──────────────────────────────────
async function stageReview(models, question, opinions) {
  const ok = opinions.filter((o) => o.ok)
  // Анонимизируем: «Ответ #1..#N», без названий моделей.
  const anon = ok.map((o, i) => `### Ответ #${i + 1}\n${o.answer}`).join('\n\n')
  const sys = 'Ты — беспристрастный рецензент. Оцени чужие ответы на вопрос по точности, '
    + 'полноте и практической пользе. Не знаешь авторов — суди только по содержанию.'
  const reviews = await Promise.all(models.map(async (model) => {
    try {
      const review = await callModel(model, [
        { role: 'system', content: sys },
        { role: 'user', content:
          `Вопрос: ${question}\n\nОтветы кандидатов:\n\n${anon}\n\n`
          + 'Дай краткую оценку каждого ответа и в конце выстрой рейтинг от лучшего к худшему '
          + '(укажи номера ответов) с одним предложением обоснования.' },
      ])
      return { model, review, ok: true }
    } catch (e) {
      return { model, review: `(ошибка: ${e.message})`, ok: false }
    }
  }))
  return { anonMap: ok.map((o, i) => ({ n: i + 1, model: o.model })), reviews }
}

// ── Стадия 3: председатель сводит финал ──────────────────────────────────────
async function stageChairman(chairman, question, opinions, reviews, context) {
  const ok = opinions.filter((o) => o.ok)
  const anon = ok.map((o, i) => `### Ответ #${i + 1}\n${o.answer}`).join('\n\n')
  const revText = reviews.filter((r) => r.ok).map((r, i) => `### Рецензент #${i + 1}\n${r.review}`).join('\n\n')
  const sys = 'Ты — председатель совета. На основе мнений и рецензий собери ОДИН итоговый ответ: '
    + 'самое верное и полезное, без воды, с конкретными рекомендациями под проект.'
  const user = `Вопрос: ${question}\n\n`
    + (context ? `Контекст проекта присутствовал у участников.\n\n` : '')
    + `Мнения:\n\n${anon}\n\n---\n\nРецензии:\n\n${revText}\n\n---\n\n`
    + 'Сформулируй финальный ответ для пользователя.'
  return callModel(chairman, [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ])
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  await loadEnv()
  const args = parseArgs(process.argv.slice(2))

  if (!args.question) {
    console.error('Использование: node tools/council/council.mjs "ваш вопрос" [-f путь/к/файлу] [--no-context]')
    process.exit(1)
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ Нет OPENROUTER_API_KEY. Задайте переменную окружения или положите в tools/council/.env')
    process.exit(1)
  }

  const models = args.models || COUNCIL
  const chairman = args.chairman || CHAIRMAN
  const context = await buildContext(args)

  console.log(`\n🗳️  Совет: ${models.join(', ')}`)
  console.log(`👤 Председатель: ${chairman}`)
  console.log(`📎 Контекст: ${context ? `${context.length} символов` : 'нет'}`)
  console.log(`❓ Вопрос: ${args.question}\n`)

  console.log('① Собираю первые мнения…')
  const opinions = await stageOpinions(models, args.question, context)
  for (const o of opinions) console.log(`   ${o.ok ? '✅' : '❌'} ${o.model}`)

  console.log('② Перекрёстное рецензирование (анонимно)…')
  const { anonMap, reviews } = await stageReview(models, args.question, opinions)

  console.log('③ Председатель сводит финал…\n')
  const final = await stageChairman(chairman, args.question, opinions, reviews, context)

  console.log('═'.repeat(70))
  console.log('ФИНАЛЬНЫЙ ОТВЕТ СОВЕТА')
  console.log('═'.repeat(70))
  console.log(final)
  console.log('═'.repeat(70))

  // Сохраняем полный протокол.
  const outDir = join(__dirname, 'out')
  await mkdir(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const md = [
    `# Совет · ${new Date().toLocaleString('ru-RU')}`,
    `\n**Вопрос:** ${args.question}\n`,
    `## Первые мнения`,
    ...opinions.map((o) => `\n### ${o.model}\n\n${o.answer}`),
    `\n## Рецензии (авторы анонимны)`,
    `\nСоответствие номеров: ${anonMap.map((a) => `#${a.n}=${a.model}`).join(', ')}`,
    ...reviews.map((r) => `\n### ${r.model}\n\n${r.review}`),
    `\n## Финальный ответ (председатель: ${chairman})\n\n${final}`,
  ].join('\n')
  const file = join(outDir, `${stamp}.md`)
  await writeFile(file, md, 'utf8')
  console.log(`\n📝 Протокол сохранён: ${file}`)
}

main().catch((e) => { console.error('Сбой совета:', e.message); process.exit(1) })
