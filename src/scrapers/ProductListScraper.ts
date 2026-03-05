import type { Page } from 'playwright'
import type { ProductListItem } from '../models/ProductListItem'
import type { ProductListResult } from '../models/ProductListResult'
import type { RetailerSearchParams } from '../models/RetailerSearchParams'
import { type Logger, silentLogger } from '../utils/logger'
import type { BrowserNavigator } from '../navigator/BrowserNavigator'

const BASE_URL = 'https://www.pccomponentes.com'
const API_BASE = `${BASE_URL}/api/articles/search`
const DEFAULT_PAGE_SIZE = 40

type ApiArticleImage = {
  path: string
  width: number
  height: number
}

type ApiArticle = {
  id: string
  name: string
  slug: string
  brandName?: string
  promotionalPrice?: number
  originalPrice?: number
  images?: {
    small?: ApiArticleImage
    medium?: ApiArticleImage
    large?: ApiArticleImage
  }
  mainCategory?: {
    name?: string
    slug?: string
  }
}

type ApiResponse = {
  articles?: ApiArticle[]
  total?: number
}

type ApiErrorPayload = { __error: { status: number; text: string } }
type ApiEvaluateResult = ApiResponse | ApiErrorPayload

export class ProductListScraper {
  // Page is kept for consistency with the IRetailer architecture.
  // We use its browser context to inherit Cloudflare cookies.
  constructor(
    private readonly navigator: BrowserNavigator,
    private readonly page: Page,
    private readonly logger: Logger = silentLogger,
  ) {}

  async scrape(params: RetailerSearchParams): Promise<ProductListResult> {
    const pageNum = params.page ?? 1
    const pageSize = DEFAULT_PAGE_SIZE
    const query = params.keywords.trim()

    this.logger.log('debug', 'PCC list scraper start', {
      query,
      page: pageNum,
    })

    await this.navigator.waitRequestDelay()
    // 1) Bootstrap cookies (lo dejamos igual por ahora)
    await this.page.goto(`${BASE_URL}/buscar/?query=${encodeURIComponent(query)}`, {
      waitUntil: 'domcontentloaded',
    })

    const url = new URL(API_BASE)
    url.searchParams.set('query', query)
    url.searchParams.set('sort', 'relevance')
    url.searchParams.set('sortVersion', 'default')
    url.searchParams.set('channel', 'es')
    url.searchParams.set('page', String(pageNum))
    url.searchParams.set('pageSize', String(pageSize))
    url.searchParams.set('analytics', 'true')
    url.searchParams.set('showOem', 'false')

    // 3) Llamada con retry/timeout
    await this.navigator.waitRequestDelay()
    const data = await this.fetchSearchApi(url.toString())

    // 4) Mapper (lo mejoraremos en A3, pero lo dejamos por ahora)

    const articles = data.articles ?? []
    const maxResults = params.maxResults ?? articles.length
    const pageWindow = params.maxResults ?? pageSize
    const offset = (pageNum - 1) * pageWindow

    const items: ProductListItem[] = articles.slice(0, maxResults).map((a, index) => {
      const rawPrice = a.promotionalPrice ?? a.originalPrice
      const price =
        typeof rawPrice === 'number' && Number.isFinite(rawPrice) ? rawPrice : 0

      if (rawPrice === null) {
        this.logger.log('warn', 'PCC list item missing price (defaulting to 0)', {
          id: a.id,
          slug: a.slug,
          promotionalPrice: a.promotionalPrice,
          originalPrice: a.originalPrice,
        })
      }

      return {
        id: a.id,
        name: a.name,
        price,
        position: offset + index + 1,
        url: `${BASE_URL}/${a.slug}`,
        imageUrl: a.images?.medium?.path ?? a.images?.small?.path,
        category: a.mainCategory?.name,
      }
    })

    return {
      query: params,
      total: data.total ?? articles.length,
      items,
    }
  }

  private async fetchSearchApi(apiUrl: string): Promise<ApiResponse> {
    // Retry simple: 3 intentos, backoff incremental
    const maxAttempts = 3
    const baseDelayMs = 500
    const timeoutMs = 10_000

    let lastErr: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const data = (await this.page.evaluate(
          async ({ apiUrl, timeoutMs }) => {
            const ctrl = new AbortController()
            const t = setTimeout(() => ctrl.abort(), timeoutMs)

            try {
              const res = await fetch(apiUrl, {
                credentials: 'include',
                signal: ctrl.signal,
                headers: {
                  accept: '*/*',
                  'accept-language': 'es-ES,es;q=0.9',
                  'content-language': 'es',
                  'x-selected-language': 'es_ES',
                },
              })

              // Reintentar en 429/5xx
              if (!res.ok) {
                return { __error: { status: res.status, text: await res.text() } }
              }

              return res.json()
            } finally {
              clearTimeout(t)
            }
          },
          { apiUrl, timeoutMs },
        )) as ApiEvaluateResult

        if ('__error' in data) {
          const { status, text } = data.__error

          if (status === 429 || (status >= 500 && status <= 599)) {
            throw new Error(
              `Search API retryable error ${status}: ${text.slice(0, 200)}`,
            )
          }

          throw new Error(`Search API error ${status}: ${text.slice(0, 200)}`)
        }

        this.logger.log('debug', 'PCC search API success', {
          attempt,
          articles: data.articles?.length ?? 0,
          total: data.total,
        })
        return data
      } catch (e) {
        lastErr = e
        this.logger.log('warn', 'PCC search API attempt failed', {
          attempt,
          maxAttempts,
          error: e instanceof Error ? e.message : String(e),
        })
        if (attempt === maxAttempts) break
        await this.navigator.waitRequestDelay()
        const delay = baseDelayMs * attempt
        await this.page.waitForTimeout(delay)
      }
    }

    throw new Error(
      `PcComponentes search API failed after ${maxAttempts} attempts. Last error: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`,
    )
  }
}
