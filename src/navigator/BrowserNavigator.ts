import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright'

import { resolveLogger, type Logger } from '../utils/logger'
import type { NavigatorConfig } from './navigator.types'

// Stealth plugin patches ~20 browser properties that Cloudflare uses to detect
// headless Playwright (navigator.webdriver, chrome.runtime, plugins, etc.)
chromium.use(StealthPlugin())

export class BrowserNavigator {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

  private readonly logger: Logger
  private readonly requestDelayMs: number
  private readonly requestDelayJitterMs: number

  // Serializes critical lifecycle operations (open/close/newPage).
  private lifecycleLock: Promise<void> = Promise.resolve()

  constructor(private readonly config: NavigatorConfig = {}) {
    this.logger = resolveLogger(config)
    this.requestDelayMs = Math.max(0, config.requestDelayMs ?? 0)
    this.requestDelayJitterMs = Math.max(0, config.requestDelayJitterMs ?? 0)
  }

  private resolveRequestDelayMs(): number {
    const base = this.requestDelayMs
    const jitter = this.requestDelayJitterMs

    // Allow "jitter-only" behavior when base delay is 0.
    if (base <= 0 && jitter <= 0) return 0
    if (jitter <= 0) return base

    const minDelay = base === 0 && jitter > 0 ? 1 : Math.max(0, base - jitter)
    const maxDelay = base + jitter
    return minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1))
  }

  async waitRequestDelay(): Promise<void> {
    const delayMs = this.resolveRequestDelayMs()
    if (delayMs <= 0) return
    await new Promise((resolve) => setTimeout(resolve, delayMs))
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

      // Partial state detected: force a clean rebuild.
      if (this.browser || this.context) {
        this.logger.log(
          'warn',
          'Navigator in partial state. Recreating browser session.',
        )
        await this.closeUnlocked()
      }

      const {
        headless = true,
        timeoutMs = 30_000,
        slowMoMs = 0,
        userAgent,
        locale,
        timezoneId,
        viewport,
      } = this.config

      try {
        this.logger.log('debug', 'Launching browser', { headless, slowMoMs })

        // Assign immediately so we can close in the catch block if newContext() fails.
        this.browser = await chromium.launch({ headless, slowMo: slowMoMs })

        const contextOptions: BrowserContextOptions = {
          locale,
          timezoneId,
          viewport,
        }
        if (userAgent) contextOptions.userAgent = userAgent

        const context = await this.browser.newContext(contextOptions)

        // Configure timeouts before exposing this.context.
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
