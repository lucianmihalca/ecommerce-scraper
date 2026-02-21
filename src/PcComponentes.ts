/**
 * Public entry point of the module.
 * Orchestrates navigation and scraping layers.
 */

import type { IRetailer } from './interfaces/IRetailer'
import type { RetailerSearchParams } from './models/RetailerSearchParams'
import type { ProductListResult } from './models/ProductListResult'
import type { ProductDetail } from './models/ProductDetail'
import type { ProductListItem } from './models/ProductListItem'
import type { NavigatorConfig } from './navigator/navigator.types'

import { BrowserNavigator } from './navigator/BrowserNavigator'
import { ProductListScraper } from './scrapers/ProductListScraper'
import { ProductDetailScraper } from './scrapers/ProductDetailScraper'

export class PcComponentes implements IRetailer {
  private readonly navigator: BrowserNavigator

  constructor(config: NavigatorConfig = {}) {
    this.navigator = new BrowserNavigator(config)
  }

  async getProductList(params: RetailerSearchParams): Promise<ProductListResult> {
    await this.navigator.open()
    const page = await this.navigator.newPage()
    const scraper = new ProductListScraper(page)
    return scraper.scrape(params)
  }

  async getProduct(input: string | ProductListItem): Promise<ProductDetail> {
    await this.navigator.open()
    const page = await this.navigator.newPage()
    const scraper = new ProductDetailScraper(page)

    if (typeof input === 'string') {
      return scraper.scrape(input)
    }

    return scraper.scrapeFromListItem(input)
  }

  async close(): Promise<void> {
    await this.navigator.close()
  }
}
