export const resolveRequestDelayMs = (
  requestDelayMs: number,
  requestDelayJitterMs: number,
): number => {
  const base = requestDelayMs
  const jitter = requestDelayJitterMs

  if (base <= 0 && jitter <= 0) return 0
  if (jitter <= 0) return base

  const minDelay = base === 0 ? 1 : Math.max(0, base - jitter)
  const maxDelay = base + jitter

  return minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1))
}

export const resolveNavigationRetryDelayMs = (
  navigationRetryBaseDelayMs: number,
  navigationRetryJitterMs: number,
  attempt: number,
): number => {
  const attemptBaseDelayMs = navigationRetryBaseDelayMs * attempt
  const jitter = navigationRetryJitterMs

  if (attemptBaseDelayMs <= 0 && jitter <= 0) return 0
  if (jitter <= 0) return attemptBaseDelayMs

  const minDelay =
    attemptBaseDelayMs === 0 ? 1 : Math.max(0, attemptBaseDelayMs - jitter)
  const maxDelay = attemptBaseDelayMs + jitter

  return minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1))
}
