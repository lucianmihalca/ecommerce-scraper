import { PcComponentes } from '../PcComponentes'

async function main() {
  const retailer = new PcComponentes({ headless: true })

  try {
    const page1 = await retailer.getProductList({
      keywords: 'ddr5',
      page: 1,
      maxResults: 5,
    })
    const page2 = await retailer.getProductList({
      keywords: 'ddr5',
      page: 2,
      maxResults: 5,
    })

    console.log('--- PAGE 1 ---')
    console.log(`✅ Query: ${page1.query.keywords}`)
    console.log(`✅ Total found: ${page1.total}`)
    page1.items.forEach((item) =>
      console.log(
        `  [${item.position}] ${item.name} — €${item.price} (${item.category ?? 'unknown'})`,
      ),
    )

    console.log('\n--- PAGE 2 ---')
    console.log(`✅ Query: ${page2.query.keywords}`)
    console.log(`✅ Total found: ${page2.total}`)
    page2.items.forEach((item) =>
      console.log(
        `  [${item.position}] ${item.name} — €${item.price} (${item.category ?? 'unknown'})`,
      ),
    )

    console.log('\n--- PRODUCT DETAIL (first result) ---')
    const firstItem = page1.items[0]
    if (firstItem) {
      const detail = await retailer.getProduct(firstItem)
      console.log(`✅ Name: ${detail.name}`)
      console.log(`✅ Brand: ${detail.brand ?? 'unknown'}`)
      console.log(`✅ Price: €${detail.price}`)
      console.log(`✅ Description: ${detail.description?.slice(0, 100)}...`)
      console.log(`✅ Images: ${detail.images.length} found`)
      console.log(`✅ Specs: ${Object.keys(detail.specs).length} found`)
      Object.entries(detail.specs).forEach(([key, value]) =>
        console.log(`    ${key}: ${value}`),
      )
    }
  } catch (error) {
    console.error('❌ Failed:', error)
  } finally {
    await retailer.close()
    console.log('\n✅ Browser closed cleanly')
  }
}

main()
