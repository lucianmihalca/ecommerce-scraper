import type { Logger, LogLevel } from '../utils/logger'

export type NavigatorConfig = {
  headless?: boolean
  timeoutMs?: number
  slowMoMs?: number
  userAgent?: string

  locale?: string
  timezoneId?: string
  viewport?: { width: number; height: number }

  // Optional: keep cookies/profile between runs
  persistentProfileDir?: string

  // Optional: debug
  logResponses?: boolean

  // Optional: logging
  logger?: Logger
  logLevel?: LogLevel

  requestDelayMs?: number
}
