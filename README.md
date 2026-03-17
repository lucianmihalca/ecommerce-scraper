# ecommerce-scraper

A modular Node.js + TypeScript scraper that programmatically navigates and extracts structured product data from e-commerce websites.

Built around a clean `IRetailer` interface, it separates browser navigation, page scraping, and the public API into distinct, maintainable layers. The current implementation targets **PcComponentes** (pccomponentes.com).

## Features

- Search products by keyword with pagination support
- Extract full product detail (specs, images, description, brand, SKU)
- Clean public API — consumers only interact with `PcComponentes`
- Headless or headed browser mode via Playwright
- Configurable request delay with optional random jitter
- Automatic navigation retries with linear backoff and configurable jitter
- Configurable log level and custom logger support
- Easily extensible to other retailers via the `IRetailer` interface

## Why PcComponentes

PcComponentes is a Spanish e-commerce with real-world anti-bot protection (Cloudflare).
Navigating it successfully required proper browser fingerprinting via Playwright — a
non-trivial challenge compared to scraping unprotected sites.

Product data is extracted using two complementary strategies:

- **Search results** — internal JSON API called within the page context to inherit Cloudflare cookies, with automatic retry and backoff
- **Product detail** — Schema.org JSON-LD structured data maintained for SEO,
  with two-layer DOM fallbacks for resilience against inconsistent layouts:
  - Description: falls back to `#description` block when JSON-LD quality is too low
  - Specs: falls back to a `<ul>` list under the "Especificaciones" heading when no structured table is present

## Tech Stack

| Tool | Purpose |
|---|---|
| Node.js v18+ | Runtime |
| TypeScript | Type safety |
| Playwright + playwright-extra | Browser automation |
| puppeteer-extra-plugin-stealth | Cloudflare fingerprint evasion |
| Vitest | Unit testing |
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
import { PcComponentes } from './src/index'

const retailer = new PcComponentes({
  headless: true,
  logLevel: 'info',
  requestDelayMs: 1500,
  requestDelayJitterMs: 300,      // actual delay is 1500 ± 300 ms
  navigationRetryMaxAttempts: 3,  // retry up to 3 times on network errors
  navigationRetryBaseDelayMs: 500, // wait 500 ms × attempt before each retry
})

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
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | silent | Minimum log level |
| `logger` | `Logger` | — | Custom logger instance (overrides `logLevel`) |
| `requestDelayMs` | `number` | `0` | Base delay between requests in ms |
| `requestDelayJitterMs` | `number` | `0` | Random jitter added to each request delay (actual delay is within `requestDelayMs ± jitter`) |
| `timeoutMs` | `number` | `30000` | Navigation and action timeout |
| `slowMoMs` | `number` | `0` | Artificial delay between browser actions (useful for debugging) |
| `userAgent` | `string` | — | Optional custom user agent string (uses Playwright's default if omitted) |
| `locale` | `string` | — | Browser language (e.g. `'es-ES'`) |
| `timezoneId` | `string` | — | Browser timezone (e.g. `'Europe/Madrid'`) |
| `viewport` | `{ width, height }` | — | Browser window size |
| `navigationRetryMaxAttempts` | `number` | `3` | Max navigation attempts before throwing |
| `navigationRetryBaseDelayMs` | `number` | `500` | Base delay before each retry (multiplied by attempt number) |
| `navigationRetryTimeoutMs` | `number` | inherits `timeoutMs` | Per-attempt navigation timeout |
| `navigationRetryJitterMs` | `number` | `0` | Random jitter added to each retry delay |

### `getProductList(params): Promise<ProductListResult>`

| Param | Type | Description |
|---|---|---|
| `keywords` | `string` | Search query |
| `page` | `number?` | 1-based page number (default: `1`) |
| `maxResults` | `number?` | Items per page. Must be an integer between `1` and `40` (`MAX_API_PAGE_SIZE`) |

Pagination contract:

- `page` and `maxResults` are sent to PcComponentes search API (`/api/articles/search`).
- `total` is the global number of matching products for the query.
- `items` includes only the current page.
- `position` is continuous for the selected page size (`maxResults`), e.g. with `maxResults=10`: page 1 -> `1..10`, page 2 -> `11..20`.
- invalid `page` / `maxResults` values fail fast with a validation error (no silent clamping).

### `getProduct(input): Promise<ProductDetail>`

Accepts either a `ProductListItem` (from a previous search) or a direct product URL string.

### `close(): Promise<void>`

Closes the browser instance. Always call this when done.

## Project Structure

```
src/
├── index.ts                        # Public barrel — exports all types and retailers
├── interfaces/
│   └── IRetailer.ts                # Retailer contract
├── models/
│   ├── ProductListItem.ts          # Listing-level product data
│   ├── ProductDetail.ts            # Full product detail (extends ProductListItem)
│   ├── ProductListResult.ts        # Search result wrapper
│   └── RetailerSearchParams.ts
├── navigator/
│   ├── BrowserNavigator.ts         # Playwright browser/page lifecycle, retry logic, lifecycle lock
│   ├── navigator.types.ts
│   └── helpers/
│       ├── delay.ts                # Request delay and retry delay with jitter
│       ├── navigationRetry.ts      # Retryable error detection and HTTP status error factory
│       └── number.ts               # Safe numeric coercion helpers
├── retailers/
│   └── pccomponentes/
│       ├── index.ts                # PcComponentes — implements IRetailer
│       ├── scrapers/
│       │   ├── ListScraper.ts           # Orchestrates search: navigate, call API, map results
│       │   ├── ListScraper.helpers.ts   # API types, param validation, data transformation
│       │   ├── DetailScraper.ts         # Orchestrates detail scraping: JSON-LD + DOM fallbacks
│       │   └── DetailScraper.helpers.ts # resolveAbsoluteUrl, isLowQualityDescription
│       ├── jsonld.ts               # Schema.org JSON-LD parsing helpers
│       └── constants.ts            # BASE_URL, API_BASE, MAX_API_PAGE_SIZE
├── utils/
│   └── logger.ts                   # Logger interface, console logger, resolveLogger
└── scripts/
    └── demo.ts                     # End-to-end usage example
```

## Extending to Other Retailers

Create a new folder under `retailers/` and implement the `IRetailer` interface:

```ts
// src/retailers/myretailer/index.ts
import type { IRetailer } from '../../interfaces/IRetailer'

export class MyRetailer implements IRetailer {
  async getProductList(params) { /* ... */ }
  async getProduct(input)      { /* ... */ }
  async close()                { /* ... */ }
}
```

Then export it from `src/index.ts`:

```ts
export { MyRetailer } from './retailers/myretailer'
```

## Scripts

| Command | Description |
|---|---|
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm build:watch` | Watch mode |
| `pnpm demo` | Run the end-to-end demo |
| `pnpm test` | Run unit tests with Vitest |
| `pnpm lint` | Run ESLint |

## Author

Lucian Mihalca
