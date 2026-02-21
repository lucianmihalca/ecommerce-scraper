import type { Page } from 'playwright'
import type { ProductListItem } from '../models/ProductListItem'
import type { ProductListResult } from '../models/ProductListResult'
import type { RetailerSearchParams } from '../models/RetailerSearchParams'

const BASE_URL = 'https://www.pccomponentes.com'

// All fragile DOM-dependent selectors live here.
// Update this object if PcComponentes changes their markup.
const SELECTORS = {
  productCard: 'a[data-testid="normal-link"][data-product-name]',
} as const

type RawItem = {
  id: string
  name: string
  price: string
  url: string
  imageUrl?: string
  category?: string
}

function absolutizeUrl(href: string): string {
  if (!href) return ''
  if (href.startsWith('http')) return href
  if (href.startsWith('/')) return `${BASE_URL}${href}`
  return `${BASE_URL}/${href}`
}

function parsePrice(raw: string): number {
  const cleaned = raw
    .replace(/\s/g, '')
    .replace('€', '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // remove thousands separator
    .replace(',', '.') // normalize decimal separator
    .replace(/[^\d.]/g, '') // remove any remaining non-numeric chars

  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : NaN
}

export class ProductListScraper {
  constructor(private readonly page: Page) {}

  async scrape(params: RetailerSearchParams): Promise<ProductListResult> {
    const query = encodeURIComponent(params.keywords.trim())
    const pageNum = params.page ?? 1
    const searchUrl = `${BASE_URL}/buscar/?query=${query}&page=${pageNum}`

    await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded' })

    const cards = this.page.locator(SELECTORS.productCard)
    await cards
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => {})

    // No results found — return empty result instead of throwing
    if ((await cards.count()) === 0) {
      return { query: params, total: 0, items: [] }
    }

    const raw: RawItem[] = await this.page.$$eval(SELECTORS.productCard, (elements) =>
      elements.map((el) => ({
        id: el.getAttribute('data-product-id') ?? '',
        name: el.getAttribute('data-product-name') ?? '',
        price: el.getAttribute('data-product-price') ?? '0',
        url: el.getAttribute('href') ?? '',
        imageUrl: el.querySelector('img')?.getAttribute('src') ?? undefined,
        category: el.getAttribute('data-product-category')?.trim() ?? undefined,
      })),
    )

    const maxResults = params.maxResults ?? raw.length
    const offset = (pageNum - 1) * maxResults

    const items: ProductListItem[] = raw.slice(0, maxResults).map((item, index) => ({
      id: item.id,
      name: item.name,
      price: parsePrice(item.price),
      position: offset + index + 1, // Position is global within our paginated result set
      url: absolutizeUrl(item.url),
      imageUrl: item.imageUrl,
      category: item.category,
    }))

    return {
      query: params,
      total: raw.length, // items found on current retailer page (not global total)
      items,
    }
  }
}
