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

  constructor(private readonly config: NavigatorConfig = {}) {
    this.logger = resolveLogger(config)

    this.requestDelayMs = config.requestDelayMs ?? 0
  }

  async waitRequestDelay(): Promise<void> {
    if (this.requestDelayMs <= 0) return

    await new Promise((resolve) => setTimeout(resolve, this.requestDelayMs))
  }

  async close(): Promise<void> {
    try {
      if (this.context) await this.context.close()
    } finally {
      this.context = null
    }

    try {
      if (this.browser) await this.browser.close()
    } finally {
      this.browser = null
    }
  }

  async open(): Promise<void> {
    if (this.browser) return

    const {
      headless = true, // Run browser without a graphical UI.
      // true  → browser runs in the background (scraping/servers)
      // false → browser window is visible (debugging)

      timeoutMs = 30_000, // Default timeout for navigation and element actions (ms)

      slowMoMs = 0, // Artificial delay between browser actions (ms).
      // Example with slowMoMs = 100:
      // click → wait 100ms → navigate → wait 100ms → type
      // Mainly useful for debugging.

      userAgent = DEFAULT_USER_AGENT, // Browser identity string used in HTTP requests

      locale, // Browser language (e.g. "es-ES")
      timezoneId, // Browser timezone (e.g. "Europe/Madrid")
      viewport, // Browser window size (e.g. { width: 1920, height: 1080 })
    } = this.config

    try {
      this.logger.log('debug', 'Launching browser', { headless, slowMoMs })

      this.browser = await chromium.launch({ headless, slowMo: slowMoMs })
      this.context = await this.browser.newContext({
        userAgent,
        locale,
        timezoneId,
        viewport,
      })

      this.context.setDefaultTimeout(timeoutMs)
      this.context.setDefaultNavigationTimeout(timeoutMs)

      this.logger.log('debug', 'Browser context ready', {
        timeoutMs,
        locale,
        timezoneId,
        viewport,
      })
    } catch (error: unknown) {
      await this.close()
      const message = error instanceof Error ? error.message : String(error)
      this.logger.log('error', 'Failed to initialize BrowserNavigator', { message })
      throw new Error(`Failed to initialize BrowserNavigator: ${message}`)
    }
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('BrowserNavigator is not opened. Call open() first.')
    }
    const page = await this.context.newPage()
    this.logger.log('debug', 'New page created')
    return page
  }
}
