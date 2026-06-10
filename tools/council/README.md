# LLM-совет (Putevo)

Лёгкий инструмент: задаёшь вопрос про проект — несколько моделей дают мнения,
анонимно рецензируют друг друга, «председатель» сводит итог. По мотивам
[karpathy/llm-council](https://github.com/karpathy/llm-council), но без Python/React —
один Node-скрипт, который умеет подмешивать контекст нашего кода.

## Установка ключа

1. Зарегистрируйся на https://openrouter.ai , пополни баланс, создай ключ.
2. Скопируй `.env.example` → `.env` и впиши `OPENROUTER_API_KEY`.
   (Файл `.env` в git не попадает.)

## Запуск (PowerShell)

```powershell
# вопрос с контекстом проекта (CLAUDE.md подмешивается автоматически)
node tools/council/council.mjs "Как лучше развести роли менеджеров и директоров?"

# добавить конкретные файлы в контекст
node tools/council/council.mjs "Найди слабые места в авторизации" -f server/src/services/users.js -f server/src/routes/auth.js

# без контекста CLAUDE.md
node tools/council/council.mjs "Общий вопрос по архитектуре" --no-context

# свой состав совета / председателя
node tools/council/council.mjs "вопрос" --models openai/gpt-4o,google/gemini-1.5-pro --chairman anthropic/claude-3.5-sonnet
```

Полный протокол (мнения + рецензии + финал) сохраняется в `tools/council/out/`.

## Настройка моделей

Список совета и председатель — вверху `council.mjs` (`COUNCIL`, `CHAIRMAN`).
Актуальные слаги: https://openrouter.ai/models . Если слаг устарел — этот участник
просто пропускается, остальные отрабатывают.

> Замечание про РФ-сеть: OpenRouter может требовать VPN/прокси. Если запросы
> отваливаются по таймауту — дело в доступе к openrouter.ai, а не в скрипте.
