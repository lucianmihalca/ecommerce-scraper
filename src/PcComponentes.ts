/**
 * Public entry point of the module.
 * Orchestrates navigation and scraping layers.
 */

import type { ProductDetail } from './models/ProductDetail'
import type { ProductListResult } from './models/ProductListResult'
import type { RetailerSearchParams } from './models/RetailerSearchParams'

export class PcComponentes {
  async getProductList(_params: RetailerSearchParams): Promise<ProductListResult> {
    throw new Error('Not implemented yet')
  }

  async getProduct(_id: string): Promise<ProductDetail> {
    throw new Error('Not implemented yet')
  }
}
