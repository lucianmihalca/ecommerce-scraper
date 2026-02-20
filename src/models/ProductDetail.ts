/**
 * Represents the full product information available on the detail page.
 * Extends ProductListItem with additional detail-specific fields.
 */

import type { ProductListItem } from './ProductListItem'

export type ProductSpects = Record<string, string>

export interface ProductDetail extends ProductListItem {
  description: string
  images: string[]
  specs: ProductSpects
  brand?: string
  sku?: string
}
