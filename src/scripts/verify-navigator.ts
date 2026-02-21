import { BrowserNavigator } from '../navigator/BrowserNavigator'
import { ProductListScraper } from '../scrapers/ProductListScraper'
import { ProductDetailScraper } from '../scrapers/ProductDetailScraper'

async function main() {
  const navigator = new BrowserNavigator({ headless: true })

  try {
    await navigator.open()
    const page = await navigator.newPage()
    const listScraper = new ProductListScraper(page)
    const detailScraper = new ProductDetailScraper(page)

    const page1 = await listScraper.scrape({ keywords: 'ddr5', page: 1, maxResults: 5 })
    const page2 = await listScraper.scrape({ keywords: 'ddr5', page: 2, maxResults: 5 })

    console.log('--- PAGE 1 ---')
    console.log(`✅ Query: ${page1.query.keywords}`)
    console.log(`✅ Total found (page): ${page1.total}`)
    console.log(`✅ Items returned: ${page1.items.length}`)
    page1.items.forEach((item) =>
      console.log(
        `  [${item.position}] ${item.name} — €${item.price} — (${item.category ?? 'unknown'})`,
      ),
    )

    console.log('--- PAGE 2 ---')
    console.log(`✅ Query: ${page2.query.keywords}`)
    console.log(`✅ Total found (page): ${page2.total}`)
    console.log(`✅ Items returned: ${page2.items.length}`)
    page2.items.forEach((item) =>
      console.log(
        `  [${item.position}] ${item.name} — €${item.price} — (${item.category ?? 'unknown'})`,
      ),
    )
    console.log('\n--- PRODUCT DETAIL (first result) ---')
    const firstItem = page1.items[0]
    if (firstItem) {
      const detail = await detailScraper.scrapeFromListItem(firstItem)
      console.log(`✅ Name: ${detail.name}`)
      console.log(`✅ Brand: ${detail.brand ?? 'unknown'}`)
      console.log(`✅ Price: €${detail.price}`)
      console.log(`✅ Category: ${detail.category ?? 'unknown'}`)
      console.log(`✅ Description: ${detail.description?.slice(0, 100)}...`)
      console.log(`✅ Images: ${detail.images.length} found`)
      console.log(`✅ SKU: ${detail.sku}`)
      console.log(`✅ Specs: ${Object.keys(detail.specs).length} found`)
      Object.entries(detail.specs).forEach(([key, value]) =>
        console.log(`    ${key}: ${value}`),
      )
    }
  } catch (error) {
    console.error('❌ Scraper failed:', error)
  } finally {
    await navigator.close()
    console.log('✅ Browser closed cleanly')
  }
}

main()
