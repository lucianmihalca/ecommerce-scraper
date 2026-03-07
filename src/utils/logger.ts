/* eslint-disable no-console */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void
}

export const silentLogger: Logger = {
  log: () => {},
}

export function createConsoleLogger(minLevel: LogLevel = 'info'): Logger {
  const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
  const min = order[minLevel]

  return {
    log(level, message, meta) {
      if (order[level] < min) return
      const payload = meta ? ` ${JSON.stringify(meta)}` : ''

      ;(level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : console.log)(`[${level.toUpperCase()}] ${message}${payload}`)
    },
  }
}

export function resolveLogger(config: {
  logger?: Logger
  logLevel?: LogLevel
}): Logger {
  return (
    config.logger ??
    (config.logLevel ? createConsoleLogger(config.logLevel) : silentLogger)
  )
}
