# ecommerce-scraper

A modular Node.js + TypeScript scraper that programmatically navigates and extracts structured product data from e-commerce websites.

Built around a clean `IRetailer` interface, it separates browser navigation, page scraping, and the public API into distinct, maintainable layers. The current implementation targets **PcComponentes** (pccomponentes.com).

## Features

- Search products by keyword with pagination support
- Extract full product detail (specs, images, description, brand, SKU)
- Clean public API — consumers only interact with `PcComponentes`
- Headless or headed browser mode via Playwright
- Easily extensible to other retailers via the `IRetailer` interface

## Why PcComponentes

PcComponentes is a Spanish e-commerce with real-world anti-bot protection (Cloudflare).
Navigating it successfully required proper browser fingerprinting via Playwright and a
custom user agent — a non-trivial challenge compared to scraping unprotected sites.

Product data is extracted using two complementary strategies:

- **Search results** — stable `data-*` attributes embedded directly in the HTML
- **Product detail** — Schema.org JSON-LD structured data maintained for SEO,
  supplemented by DOM extraction for technical specifications

## Tech Stack

| Tool | Purpose |
|---|---|
| Node.js v18+ | Runtime |
| TypeScript | Type safety |
| Playwright | Browser automation |
| pnpm | Package manager |

## Installation

> Requires **pnpm**. Install it with `npm install -g pnpm` if needed.

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
```

## Quick Start

```ts
import { PcComponentes } from './src/PcComponentes'

const retailer = new PcComponentes({ headless: true })

// Search products
const result = await retailer.getProductList({ keywords: 'ddr5', page: 1, maxResults: 5 })
console.log(result.items)

// Get full product detail
const detail = await retailer.getProduct(result.items[0])
console.log(detail.name, detail.price, detail.specs)

await retailer.close()
```

Or run the built-in demo:

```bash
pnpm demo
```

## API

### `new PcComponentes(config?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `headless` | `boolean` | `true` | Run browser in headless mode |

### `getProductList(params): Promise<ProductListResult>`

| Param | Type | Description |
|---|---|---|
| `keywords` | `string` | Search query |
| `page` | `number?` | Page number (default: 1) |
| `maxResults` | `number?` | Max items to return |
| `category` | `string?` | Filter by category |

### `getProduct(input): Promise<ProductDetail>`

Accepts either a `ProductListItem` (from a previous search) or a direct product URL string.

### `close(): Promise<void>`

Closes the browser instance. Always call this when done.

## Project Structure

```
src/
├── PcComponentes.ts          # Public API — implements IRetailer
├── index.ts                  # Module entry point
├── interfaces/
│   └── IRetailer.ts          # Retailer contract
├── models/
│   ├── ProductListItem.ts    # Listing-level product data
│   ├── ProductDetail.ts      # Full product detail (extends ProductListItem)
│   ├── ProductListResult.ts  # Search result wrapper
│   └── RetailerSearchParams.ts
├── navigator/
│   ├── BrowserNavigator.ts   # Playwright browser/page lifecycle
│   └── navigator.types.ts
├── scrapers/
│   ├── ProductListScraper.ts # Extracts product cards from search pages
│   └── ProductDetailScraper.ts # Extracts detail via Schema.org JSON-LD + DOM
└── scripts/
    └── demo.ts               # End-to-end usage example
```

## Extending to Other Retailers

Implement the `IRetailer` interface to add support for a new retailer:

```ts
import type { IRetailer } from './interfaces/IRetailer'

export class MyRetailer implements IRetailer {
  async getProductList(params) { /* ... */ }
  async getProduct(input)      { /* ... */ }
  async close()                { /* ... */ }
}
```

## Scripts

| Command | Description |
|---|---|
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm build:watch` | Watch mode |
| `pnpm demo` | Run the end-to-end demo |
| `pnpm lint` | Run ESLint |

## Author

Lucian Mihalca
