// Defines the parameters accepted by getProductList().

export interface RetailerSearchParams {
  keywords: string
  page?: number
  maxResults?: number
  category?: string
}
