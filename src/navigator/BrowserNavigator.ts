import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

import type { NavigatorConfig } from './navigator.types'
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export class BrowserNavigator {
  private browser: Browser | null = null
  private context: BrowserContext | null = null

  constructor(private readonly config: NavigatorConfig = {}) {}

  // Close is defined first so it can be safely referenced inside open()'s catch block.
  async close(): Promise<void> {
    // We use separate try/finally blocks so that even if closing the context throws,
    // we still attempt to close the browser and always null out both references.
    try {
      if (this.context) {
        await this.context.close()
      }
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
    // Prevent double initialization.
    if (this.browser) return

    const headless = this.config.headless ?? true
    const timeoutMs = this.config.timeoutMs ?? 30_000
    const slowMoMs = this.config.slowMoMs ?? 0

    try {
      this.browser = await chromium.launch({ headless, slowMo: slowMoMs })

      const userAgent = this.config.userAgent ?? DEFAULT_USER_AGENT

      //   this.context = await this.browser.newContext()
      this.context = await this.browser.newContext({ userAgent })

      // Apply default timeouts to all pages created from this context.
      this.context.setDefaultTimeout(timeoutMs)
      this.context.setDefaultNavigationTimeout(timeoutMs)
    } catch (error: unknown) {
      // If initialization fails halfway, clean up any resources already created.
      await this.close()
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to initialize BrowserNavigator: ${message}`)
    }
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('BrowserNavigator is not opened. Call open() first.')
    }
    return this.context.newPage()
  }
}
