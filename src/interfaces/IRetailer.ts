import type { RetailerSearchParams } from '../models/RetailerSearchParams'
import type { ProductListResult } from '../models/ProductListResult'
import type { ProductDetail } from '../models/ProductDetail'
import type { ProductListItem } from '../models/ProductListItem'

export interface IRetailer {
  getProductList(params: RetailerSearchParams): Promise<ProductListResult>
  getProduct(input: string | ProductListItem): Promise<ProductDetail>
  close(): Promise<void>
}
