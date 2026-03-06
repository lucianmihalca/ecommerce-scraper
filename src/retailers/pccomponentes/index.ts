/**
 * Public entry point of the module.
 * Orchestrates navigation and scraping layers.
 */

import type { IRetailer } from '../../interfaces/IRetailer'
import type { RetailerSearchParams } from '../../models/RetailerSearchParams'
import type { ProductListResult } from '../../models/ProductListResult'
import type { ProductDetail } from '../../models/ProductDetail'
import type { ProductListItem } from '../../models/ProductListItem'
import type { NavigatorConfig } from '../../navigator/navigator.types'

import { BrowserNavigator } from '../../navigator/BrowserNavigator'
import { ListScraper } from './scrapers/ListScraper'
import { DetailScraper } from './scrapers/DetailScraper'
import { resolveLogger, type Logger } from '../../utils/logger'

export class PcComponentes implements IRetailer {
  private readonly navigator: BrowserNavigator
  private readonly logger: Logger

  constructor(config: NavigatorConfig = {}) {
    this.navigator = new BrowserNavigator(config)
    this.logger = resolveLogger(config)
  }

  async getProductList(params: RetailerSearchParams): Promise<ProductListResult> {
    await this.navigator.open()
    const page = await this.navigator.newPage()

    try {
      const scraper = new ListScraper(this.navigator, page, this.logger)

      return await scraper.scrape(params)
    } finally {
      await page.close()
    }
  }

  async getProduct(input: string | ProductListItem): Promise<ProductDetail> {
    await this.navigator.open()
    const page = await this.navigator.newPage()

    try {
      const scraper = new DetailScraper(this.navigator, page, this.logger)

      if (typeof input === 'string') {
        return await scraper.scrape(input)
      }

      return await scraper.scrapeFromListItem(input)
    } finally {
      await page.close()
    }
  }

  async close(): Promise<void> {
    await this.navigator.close()
  }
}
