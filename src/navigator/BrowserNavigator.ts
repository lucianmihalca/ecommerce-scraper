import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, BrowserContext, Page } from 'playwright'

import { resolveLogger, type Logger } from '../utils/logger'
import type { NavigatorConfig } from './navigator.types'

// Stealth plugin patches ~20 browser properties that Cloudflare uses to detect
// headless Playwright (navigator.webdriver, chrome.runtime, plugins, etc.)
chromium.use(StealthPlugin())

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export class BrowserNavigator {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

  private readonly logger: Logger
  private readonly requestDelayMs: number

  // Serializes critical lifecycle operations (open/close/newPage).
  private lifecycleLock: Promise<void> = Promise.resolve()

  constructor(private readonly config: NavigatorConfig = {}) {
    this.logger = resolveLogger(config)
    this.requestDelayMs = config.requestDelayMs ?? 0
  }

  async waitRequestDelay(): Promise<void> {
    if (this.requestDelayMs <= 0) return
    await new Promise((resolve) => setTimeout(resolve, this.requestDelayMs))
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
        userAgent = DEFAULT_USER_AGENT,
        locale,
        timezoneId,
        viewport,
      } = this.config

      try {
        this.logger.log('debug', 'Launching browser', { headless, slowMoMs })

        // Assign immediately so we can close in the catch block if newContext() fails.
        this.browser = await chromium.launch({ headless, slowMo: slowMoMs })

        const context = await this.browser.newContext({
          userAgent,
          locale,
          timezoneId,
          viewport,
        })

        // Configure timeouts before exposing this.context.
        context.setDefaultTimeout(timeoutMs)
        context.setDefaultNavigationTimeout(timeoutMs)

        this.context = context

        this.logger.log('debug', 'Browser context ready', {
          timeoutMs,
          locale,
          timezoneId,
          viewport,
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
