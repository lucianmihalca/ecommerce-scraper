/**
 * Represents a product item as displayed in a search results page.
 * Contains only listing-level metadata.
 */

export interface ProductListItem {
  id: string
  name: string
  price: number
  url: string
  position: number
  imageUrl?: string
}
