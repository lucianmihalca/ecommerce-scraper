import type { Page } from 'playwright'
import type { ProductDetail, ProductSpecs } from '../../../models/ProductDetail'
import type { ProductListItem } from '../../../models/ProductListItem'
import type { Logger } from '../../../utils/logger'
import { silentLogger } from '../../../utils/logger'
import type { BrowserNavigator } from '../../../navigator/BrowserNavigator'
import { BASE_URL } from '../constants'
import { extractBrand, extractImages, extractPrice, getJsonLdProduct } from '../jsonld'

export class DetailScraper {
  constructor(
    private readonly navigator: BrowserNavigator,
    private readonly page: Page,
    private readonly logger: Logger = silentLogger,
  ) {}

  /**
   * @param listItemContext - Optional data from the list scrape (id, price, position…)
   * used as fallback when the product page JSON-LD is incomplete.
   */
  async scrape(
    url: string,
    listItemContext?: Partial<ProductListItem>,
  ): Promise<ProductDetail> {
    const absoluteUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`

    await this.navigator.waitRequestDelay()
    await this.page.goto(absoluteUrl, { waitUntil: 'domcontentloaded' })

    await this.page.waitForSelector('table.smart-product-table, #description', {
      timeout: 10000,
    })

    const product = await getJsonLdProduct(this.page)
    if (!product) {
      throw new Error(`Product JSON-LD not found at: ${absoluteUrl}`)
    }

    // Description: JSON-LD by default, DOM fallback only if low quality (index 0 case)
    const productName = (product.name?.trim() ?? listItemContext?.name ?? '').trim()
    const jsonLdDescription = (product.description ?? '').trim()

    let description = jsonLdDescription
    if (this.isLowQualityDescription(jsonLdDescription, productName)) {
      const domDescription = await this.extractDescriptionFromDescriptionBlock()
      if (domDescription) description = domDescription
    }

    const price = extractPrice(product.offers, listItemContext?.price)
    if (typeof price !== 'number') {
      throw new Error(`Product price not found or invalid at: ${absoluteUrl}`)
    }

    const images = extractImages(product)

    const hasText = await this.page
      .locator('body')
      .innerText()
      .then((t) => /especificaciones/i.test(t))
      .catch(() => false)

    const tableCount = await this.page.locator('table.smart-product-table').count()
    const headingCount = await this.page
      .locator('h2, h3')
      .filter({ hasText: /especific/i })
      .count()
    const dlCount = await this.page.locator('dl dt').count()

    const specs = await this.extractSpecs()

    this.logger.log('debug', 'PCC PDP specs debug', {
      url: absoluteUrl,
      name: productName,
      hasText,
      tableCount,
      headingCount,
      dlCount,
      specsCount: Object.keys(specs).length,
    })

    return {
      id: listItemContext?.id ?? product.sku ?? product.productID ?? absoluteUrl,
      name: productName,
      price,
      url: product.url ?? absoluteUrl,
      position: listItemContext?.position ?? 0,
      imageUrl: listItemContext?.imageUrl ?? images[0] ?? undefined,
      category: product.category?.trim() ?? listItemContext?.category,
      brand: extractBrand(product),
      description,
      images,
      specs,
      sku: product.sku,
    }
  }

  // -------------------------
  // Description helpers
  // -------------------------

  private isLowQualityDescription(description: string, productName: string): boolean {
    const normalizedDescription = description.trim().toLowerCase()
    const normalizedName = productName.trim().toLowerCase()

    if (!normalizedDescription) return true

    const cssLikeBlockPattern = /\{[^}]*:[^}]*\}/
    const containsCssMarkers =
      normalizedDescription.startsWith('@font-face') ||
      normalizedDescription.includes('font-family') ||
      normalizedDescription.includes('src: url(') ||
      cssLikeBlockPattern.test(normalizedDescription)

    if (containsCssMarkers) return true

    // Detect "name repeated many times" (common bad JSON-LD on some products)
    if (normalizedName) {
      const occurrences = normalizedDescription.split(normalizedName).length - 1
      if (occurrences >= 2) return true
    }

    return false
  }

  /**
   * Extracts the readable "Sobre el producto" text from the DOM.
   * It takes <p> blocks inside #description until "Características" / "Especificaciones" headings appear.
   */
  private async extractDescriptionFromDescriptionBlock(): Promise<string> {
    try {
      return await this.page.evaluate(() => {
        const descriptionRoot = document.querySelector('#description')
        if (!descriptionRoot) return ''

        const paragraphs: string[] = []
        const children = Array.from(descriptionRoot.children)

        for (const element of children) {
          const tagName = element.tagName.toLowerCase()

          if (tagName === 'h2' || tagName === 'h3') {
            const headingText = (element.textContent ?? '').toLowerCase()
            const isStopHeading =
              headingText.includes('caracter') || headingText.includes('especific')
            if (isStopHeading) break
          }

          if (tagName === 'p') {
            const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
            if (text) paragraphs.push(text)
          }
        }

        return paragraphs.join('\n\n')
      })
    } catch {
      return ''
    }
  }

  // Primary strategy: structured table (most products)
  private async extractSpecsFromTable(): Promise<ProductSpecs> {
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

  // Fallback strategy: specs as a list under "Especificaciones" heading (custom HTML products)
  private async extractSpecsFromDescriptionBlock(): Promise<ProductSpecs> {
    try {
      return await this.page.evaluate(() => {
        const specs: Record<string, string> = {}

        const description = document.querySelector('#description')
        if (!description) return specs

        const headings = Array.from(description.querySelectorAll('h2, h3'))
        const specHeading = headings.find((h) =>
          h.textContent?.toLowerCase().includes('especificaciones'),
        )
        if (!specHeading) return specs

        let node = specHeading.nextElementSibling
        let ul: Element | null = null

        while (node) {
          const tagName = node.tagName.toLowerCase()

          // Stop when we reach the next section heading.
          if (tagName === 'h2' || tagName === 'h3') break

          if (tagName === 'ul') {
            ul = node
            break
          }

          node = node.nextElementSibling
        }

        if (!ul) return specs

        for (const li of Array.from(ul.querySelectorAll('li'))) {
          const text = li.textContent?.trim() ?? ''
          if (!text) continue

          const asciiIndex = text.indexOf(':')
          const fullWidthIndex = text.indexOf('：')
          const idx = asciiIndex >= 0 ? asciiIndex : fullWidthIndex
          if (idx > 0) {
            specs[text.slice(0, idx).trim()] = text.slice(idx + 1).trim()
          } else {
            specs[text] = 'true'
          }
        }

        return specs
      })
    } catch {
      return {}
    }
  }

  // Tries table first, falls back to description list if table is empty
  private async extractSpecs(): Promise<ProductSpecs> {
    const fromTable = await this.extractSpecsFromTable()
    if (Object.keys(fromTable).length > 0) return fromTable

    const fromDescription = await this.extractSpecsFromDescriptionBlock()
    if (Object.keys(fromDescription).length > 0) return fromDescription

    return {}
  }

  // Scrape detail directly from a list item
  async scrapeFromListItem(item: ProductListItem): Promise<ProductDetail> {
    return this.scrape(item.url, item)
  }
}
