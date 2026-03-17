import type { Logger, LogLevel } from '../utils/logger'

export type NavigatorConfig = {
  headless?: boolean
  timeoutMs?: number
  slowMoMs?: number
  userAgent?: string

  locale?: string
  timezoneId?: string
  viewport?: { width: number; height: number }

  logger?: Logger
  logLevel?: LogLevel

  requestDelayMs?: number
  requestDelayJitterMs?: number
}
