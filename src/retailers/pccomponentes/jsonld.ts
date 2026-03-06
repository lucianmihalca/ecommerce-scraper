// PcComponentes embeds Schema.org JSON-LD in every product page.

import type { Page } from 'playwright'

// More reliable than DOM selectors as it's maintained for SEO purposes.
export type JsonLdProduct = {
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

export async function getJsonLdProduct(page: Page): Promise<JsonLdProduct | null> {
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

export function extractBrand(product: JsonLdProduct): string | undefined {
  if (!product.brand) return undefined
  if (typeof product.brand === 'string') return product.brand.trim() || undefined
  return product.brand.name?.trim() || undefined
}

export function extractImages(product: JsonLdProduct): string[] {
  return toArray(product.image)
    .map((x) => String(x))
    .filter(Boolean)
}

export function extractPrice(offers: unknown, fallback?: number): number | undefined {
  if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback

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

  return undefined
}
