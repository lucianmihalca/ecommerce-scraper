import { BrowserNavigator } from '../navigator/BrowserNavigator'

async function main() {
  const navigator = new BrowserNavigator({
    headless: false,
    slowMoMs: 50,
  })

  try {
    await navigator.open()
    const page = await navigator.newPage()
    await page.goto('https://www.pccomponentes.com')

    console.log('URL:', page.url())
    console.log('Title:', await page.title())
  } catch (error) {
    console.error('Navigator verification failed:', error)
  } finally {
    await navigator.close()
  }
}

main()
