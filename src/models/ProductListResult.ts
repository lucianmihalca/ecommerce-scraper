/**
 * Represents the full result of a product search.
 * Returned by getProductList().
 */

import type { ProductListItem } from './ProductListItem'
import type { RetailerSearchParams } from './RetailerSearchParams'

export interface ProductListResult {
  query: RetailerSearchParams
  total?: number
  items: ProductListItem[]
}
