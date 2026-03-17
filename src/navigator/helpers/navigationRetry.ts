import type { Page } from 'playwright'

export type GotoOptions = NonNullable<Parameters<Page['goto']>[1]>
export type GotoResult = Awaited<ReturnType<Page['goto']>>
export type RetryableError = Error & { retryable?: boolean }

export const createNavigationStatusError = (
  url: string,
  status: number,
): RetryableError => {
  const error = new Error(
    `Navigation failed with status ${status} at: ${url}`,
  ) as RetryableError

  error.retryable = status === 408 || status === 429 || status >= 500
  return error
}

export const isRetryableNavigationError = (error: unknown): boolean => {
  const maybeRetryable = error as RetryableError
  if (typeof maybeRetryable?.retryable === 'boolean') {
    return maybeRetryable.retryable
  }

  if (!(error instanceof Error)) return true
  if (error.name === 'TimeoutError') return true

  const message = error.message.toLowerCase()
  return (
    message.includes('timeout') ||
    message.includes('net::err') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    message.includes('socket hang up')
  )
}
