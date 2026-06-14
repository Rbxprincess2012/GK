// Клиент YandexGPT (Yandex Cloud Foundation Models). Синхронный completion.
//  • POST https://llm.api.cloud.yandex.net/foundationModels/v1/completion
//  • Заголовок Authorization: Api-Key <ключ> (+ x-folder-id). modelUri = gpt://<folder>/<model>/latest.
//  • usage-токены приходят СТРОКАМИ → Number(). status альтернативы: FINAL | TRUNCATED_FINAL | CONTENT_FILTER.
// fetchImpl/timeout инъектируются в тестах. Хост — РФ-инфраструктура, доступен из РФ.
const COMPLETION_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'

export async function complete(messages, {
  apiKey, folderId, model = 'yandexgpt', temperature = 0.3, maxTokens = 1500,
  fetchImpl = fetch, timeoutMs = 30000,
} = {}) {
  if (!apiKey || !folderId) {
    throw Object.assign(new Error('yandex_not_configured'), { status: 503, code: 'not_configured' })
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(COMPLETION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        'x-folder-id': folderId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        modelUri: `gpt://${folderId}/${model}/latest`,
        completionOptions: { stream: false, temperature, maxTokens },
        messages,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw Object.assign(new Error('yandex_api_error'), { status: 502, httpStatus: res.status, body })
    }
    const data = await res.json()
    const alt = data?.result?.alternatives?.[0]
    return {
      text: alt?.message?.text || '',
      status: alt?.status || null,                       // ALTERNATIVE_STATUS_*
      tokens: Number(data?.result?.usage?.totalTokens) || null,
    }
  } catch (e) {
    if (e.name === 'AbortError') throw Object.assign(new Error('yandex_timeout'), { status: 504 })
    throw e
  } finally {
    clearTimeout(timer)
  }
}
