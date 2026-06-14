// Ждать появления токена в Настройках вместо exit(1) — чтобы контейнер бота не рестарт-лупил,
// а сам поднялся, когда токен внесут в админке. Логирует предупреждение один раз.
export async function waitForToken(getToken, label, intervalMs = 60000) {
  let warned = false
  for (;;) {
    const t = await getToken().catch(() => null)
    if (t) return t
    if (!warned) {
      console.error(`[${label}] Токен не задан — жду внесения в Настройках (опрос каждые ${Math.round(intervalMs / 1000)}с)…`)
      warned = true
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
