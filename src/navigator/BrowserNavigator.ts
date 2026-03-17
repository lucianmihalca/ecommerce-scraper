import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright'

import { resolveLogger, type Logger } from '../utils/logger'
import type { NavigatorConfig } from './navigator.types'
import { toNonNegativeInt, toPositiveInt } from './helpers/number'
import { resolveNavigationRetryDelayMs, resolveRequestDelayMs } from './helpers/delay'
import {
  createNavigationStatusError,
  isRetryableNavigationError,
  type GotoOptions,
  type GotoResult,
} from './helpers/navigationRetry'

chromium.use(StealthPlugin())

export class BrowserNavigator {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

  private readonly logger: Logger
  private readonly requestDelayMs: number
  private readonly requestDelayJitterMs: number

  private readonly navigationRetryMaxAttempts: number
  private readonly navigationRetryBaseDelayMs: number
  private readonly navigationRetryTimeoutMs: number
  private readonly navigationRetryJitterMs: number

  // Serializes critical lifecycle operations (open/close/newPage).
  private lifecycleLock: Promise<void> = Promise.resolve()

  constructor(private readonly config: NavigatorConfig = {}) {
    this.logger = resolveLogger(config)

    this.requestDelayMs = toNonNegativeInt(config.requestDelayMs, 0)
    this.requestDelayJitterMs = toNonNegativeInt(config.requestDelayJitterMs, 0)

    this.navigationRetryMaxAttempts = toPositiveInt(
      config.navigationRetryMaxAttempts,
      3,
    )
    this.navigationRetryBaseDelayMs = toNonNegativeInt(
      config.navigationRetryBaseDelayMs,
      500,
    )
    this.navigationRetryTimeoutMs = toNonNegativeInt(
      config.navigationRetryTimeoutMs,
      toNonNegativeInt(config.timeoutMs, 30_000),
    )

    this.navigationRetryJitterMs = toNonNegativeInt(config.navigationRetryJitterMs, 0)
  }

  async waitRequestDelay(): Promise<void> {
    const delayMs = resolveRequestDelayMs(
      this.requestDelayMs,
      this.requestDelayJitterMs,
    )
    if (delayMs <= 0) return
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  async gotoWithRetry(
    page: Page,
    url: string,
    options: GotoOptions = {},
  ): Promise<GotoResult> {
    let lastError: unknown

    for (let attempt = 1; attempt <= this.navigationRetryMaxAttempts; attempt++) {
      try {
        const timeout =
          typeof options.timeout === 'number' && Number.isFinite(options.timeout)
            ? Math.max(0, Math.floor(options.timeout))
            : this.navigationRetryTimeoutMs

        const response = await page.goto(url, { ...options, timeout })
        const status = response?.status()

        if (typeof status === 'number' && status >= 400) {
          throw createNavigationStatusError(url, status)
        }

        this.logger.log('debug', 'Navigation success', { url, attempt, status })
        return response
      } catch (error: unknown) {
        lastError = error
        const retryable = isRetryableNavigationError(error)

        this.logger.log('warn', 'Navigation attempt failed', {
          url,
          attempt,
          maxAttempts: this.navigationRetryMaxAttempts,
          retryable,
          error: error instanceof Error ? error.message : String(error),
        })

        if (!retryable || attempt === this.navigationRetryMaxAttempts) break

        const retryDelayMs = resolveNavigationRetryDelayMs(
          this.navigationRetryBaseDelayMs,
          this.navigationRetryJitterMs,
          attempt,
        )
        if (retryDelayMs > 0) await page.waitForTimeout(retryDelayMs)
      }
    }

    throw new Error(
      `Navigation failed after ${this.navigationRetryMaxAttempts} attempts for ${url}. Last error: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    )
  }

  private isReady(): boolean {
    return Boolean(this.browser && this.browser.isConnected() && this.context)
  }

  private async withLifecycleLock<T>(task: () => Promise<T>): Promise<T> {
    const previousLock = this.lifecycleLock
    let releaseLock!: () => void

    this.lifecycleLock = new Promise<void>((resolve) => {
      releaseLock = resolve
    })

    await previousLock
    try {
      return await task()
    } finally {
      releaseLock()
    }
  }

  // Used within the lock to avoid deadlocks.
  private async closeUnlocked(): Promise<void> {
    const context = this.context
    const browser = this.browser

    this.context = null
    this.browser = null

    const errors: unknown[] = []

    if (context) {
      try {
        await context.close()
      } catch (error: unknown) {
        errors.push(error)
      }
    }

    if (browser) {
      try {
        await browser.close()
      } catch (error: unknown) {
        errors.push(error)
      }
    }

    if (errors.length > 0) {
      throw errors[0] instanceof Error ? errors[0] : new Error(String(errors[0]))
    }
  }

  async close(): Promise<void> {
    await this.withLifecycleLock(async () => {
      await this.closeUnlocked()
    })
  }

  async open(): Promise<void> {
    await this.withLifecycleLock(async () => {
      if (this.isReady()) return

      if (this.browser || this.context) {
        this.logger.log(
          'warn',
          'Navigator in partial state. Recreating browser session.',
        )
        await this.closeUnlocked()
      }

      const {
        headless = true,
        slowMoMs = 0,
        userAgent,
        locale,
        timezoneId,
        viewport,
      } = this.config

      const timeoutMs = toNonNegativeInt(this.config.timeoutMs, 30_000)

      try {
        this.logger.log('debug', 'Launching browser', { headless, slowMoMs })

        this.browser = await chromium.launch({ headless, slowMo: slowMoMs })

        const contextOptions: BrowserContextOptions = {
          locale,
          timezoneId,
          viewport,
        }
        if (userAgent) contextOptions.userAgent = userAgent

        const context = await this.browser.newContext(contextOptions)

        context.setDefaultTimeout(timeoutMs)
        context.setDefaultNavigationTimeout(timeoutMs)

        this.context = context

        this.logger.log('debug', 'Browser context ready', {
          timeoutMs,
          locale,
          timezoneId,
          viewport,
          hasCustomUserAgent: Boolean(userAgent),
        })
      } catch (error: unknown) {
        try {
          await this.closeUnlocked()
        } catch (closeError: unknown) {
          const closeMessage =
            closeError instanceof Error ? closeError.message : String(closeError)
          this.logger.log('warn', 'Cleanup after open failure also failed', {
            closeMessage,
          })
        }

        const message = error instanceof Error ? error.message : String(error)
        this.logger.log('error', 'Failed to initialize BrowserNavigator', { message })
        throw new Error(`Failed to initialize BrowserNavigator: ${message}`)
      }
    })
  }

  async newPage(): Promise<Page> {
    return this.withLifecycleLock(async () => {
      if (!this.isReady() || !this.context) {
        throw new Error('BrowserNavigator is not opened. Call open() first.')
      }

      const page = await this.context.newPage()
      this.logger.log('debug', 'New page created')
      return page
    })
  }
}
