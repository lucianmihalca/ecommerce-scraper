import { BrowserNavigator } from '../navigator/BrowserNavigator'
import { ProductListScraper } from '../scrapers/ProductListScraper'

async function main() {
  const navigator = new BrowserNavigator({ headless: true })

  try {
    await navigator.open()
    const page = await navigator.newPage()
    const scraper = new ProductListScraper(page)

    const page1 = await scraper.scrape({ keywords: 'ddr5', page: 1, maxResults: 5 })
    const page2 = await scraper.scrape({ keywords: 'ddr5', page: 2, maxResults: 5 })

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
  } catch (error) {
    console.error('❌ Scraper failed:', error)
  } finally {
    await navigator.close()
    console.log('✅ Browser closed cleanly')
  }
}

main()
