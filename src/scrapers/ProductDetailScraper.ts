import type { Page } from 'playwright'
import type { ProductDetail, ProductSpecs } from '../models/ProductDetail'
import type { ProductListItem } from '../models/ProductListItem'

const BASE_URL = 'https://www.pccomponentes.com'

// PcComponentes embeds Schema.org JSON-LD in every product page.
// More reliable than DOM selectors as it's maintained for SEO purposes.
type JsonLdProduct = {
  '@context'?: string
  '@type'?: string | string[]
  name?: string
  description?: string
  image?: string | string[]
  url?: string
  sku?: string
  category?: string
  productID?: string
  model?: string
  mpn?: string
  gtin13?: string
  brand?: { name?: string } | string
  offers?: unknown
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function isProductNode(node: unknown): node is JsonLdProduct {
  if (typeof node !== 'object' || node === null) return false
  const t = (node as Record<string, unknown>)['@type']
  if (!t) return false
  if (Array.isArray(t)) return t.map(String).some((x) => x.toLowerCase() === 'product')
  return String(t).toLowerCase() === 'product'
}

function extractNodes(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  const graph = (parsed as Record<string, unknown>)?.['@graph']
  if (Array.isArray(graph)) return graph
  return [parsed]
}

async function getJsonLdProduct(page: Page): Promise<JsonLdProduct | null> {
  // Try the specific product script id first — fastest and most stable
  const byId = await page
    .locator('#microdata-product-script')
    .first()
    .textContent()
    .catch(() => null)

  if (byId) {
    const parsed = safeJsonParse(byId)
    if (parsed) {
      const product = extractNodes(parsed).find(isProductNode)
      if (product) return product
    }
  }

  // Fallback: search all JSON-LD scripts on the page
  const scripts = await page.$$eval('script[type="application/ld+json"]', (els) =>
    els.map((el) => el.textContent ?? ''),
  )

  for (const raw of scripts) {
    const parsed = safeJsonParse(raw)
    if (!parsed) continue
    const product = extractNodes(parsed).find(isProductNode)
    if (product) return product
  }

  return null
}

function extractBrand(product: JsonLdProduct): string | undefined {
  if (!product.brand) return undefined
  if (typeof product.brand === 'string') return product.brand.trim() || undefined
  return product.brand.name?.trim() || undefined
}

function extractImages(product: JsonLdProduct): string[] {
  return toArray(product.image)
    .map((x) => String(x))
    .filter(Boolean)
}

function extractPrice(offers: unknown, fallback?: number): number {
  if (typeof fallback === 'number') return fallback

  const obj = Array.isArray(offers)
    ? offers[0]
    : typeof offers === 'object' && offers !== null
      ? offers
      : null

  if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>
    const candidate = o['lowPrice'] ?? o['price'] ?? o['highPrice']
    const n = Number.parseFloat(String(candidate ?? 'NaN'))
    if (Number.isFinite(n)) return n
  }

  return NaN
}

export class ProductDetailScraper {
  constructor(private readonly page: Page) {}

  async scrape(url: string, base?: Partial<ProductListItem>): Promise<ProductDetail> {
    const absoluteUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`

    await this.page.goto(absoluteUrl, { waitUntil: 'domcontentloaded' })

    const product = await getJsonLdProduct(this.page)
    if (!product) {
      throw new Error(`Product JSON-LD not found at: ${absoluteUrl}`)
    }

    const images = extractImages(product)
    const specs = await this.extractSpecs()

    return {
      id: base?.id ?? product.sku ?? product.productID ?? absoluteUrl,
      name: product.name?.trim() ?? base?.name ?? '',
      price: extractPrice(product.offers, base?.price),
      url: product.url ?? absoluteUrl,
      position: base?.position ?? 0,
      imageUrl: base?.imageUrl ?? images[0] ?? undefined,
      category: product.category?.trim() ?? base?.category,
      brand: extractBrand(product),
      description: (product.description ?? '').trim(),
      images,
      specs,
      sku: product.sku,
    }
  }

  private async extractSpecs(): Promise<ProductSpecs> {
    try {
      return await this.page.$$eval('table.smart-product-table tr', (rows) => {
        const specs: Record<string, string> = {}
        for (const row of rows) {
          const cells = row.querySelectorAll('td, th')
          const key = cells[0]?.textContent?.trim()
          const value = cells[1]?.textContent?.trim()
          if (!key || !value) continue
          if (
            key.toLowerCase() === 'especificación' &&
            value.toLowerCase() === 'detalle'
          )
            continue
          specs[key] = value
        }
        return specs
      })
    } catch {
      return {}
    }
  }

  // Scrape detail directly from a list item
  async scrapeFromListItem(item: ProductListItem): Promise<ProductDetail> {
    return this.scrape(item.url, item)
  }
}
