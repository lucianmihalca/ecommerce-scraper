import type { Page } from 'playwright'
import type { ProductListItem } from '../../../models/ProductListItem'
import type { ProductListResult } from '../../../models/ProductListResult'
import type { RetailerSearchParams } from '../../../models/RetailerSearchParams'
import { type Logger, silentLogger } from '../../../utils/logger'
import type { BrowserNavigator } from '../../../navigator/BrowserNavigator'
import { API_BASE, BASE_URL, MAX_API_PAGE_SIZE } from '../constants'

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

type SearchApiUrlParams = {
  query: string
  pageNumber: number
  pageSize: number
}

export class ListScraper {
  // Page is kept for consistency with the IRetailer architecture.
  // We use its browser context to inherit Cloudflare cookies.
  constructor(
    private readonly navigator: BrowserNavigator,
    private readonly page: Page,
    private readonly logger: Logger = silentLogger,
  ) {}

  async scrape(params: RetailerSearchParams): Promise<ProductListResult> {
    const pageNumber = this.resolvePageNumber(params.page)
    const pageSize = this.resolveMaxResults(params.maxResults, MAX_API_PAGE_SIZE)
    const query = this.normalizeQuery(params.keywords)
    const maxResults = pageSize

    this.logger.log('debug', 'PCC list scraper start', {
      query,
      page: pageNumber,
      maxResults,
    })

    await this.navigator.waitRequestDelay()
    await this.bootstrapSearchContext(query)

    const apiUrl = this.buildSearchApiUrl({
      query,
      pageNumber,
      pageSize,
    })

    await this.navigator.waitRequestDelay()
    const apiResponse = await this.fetchSearchApi(apiUrl)

    const articles = apiResponse.articles ?? []
    const globalOffset = (pageNumber - 1) * pageSize

    const items: ProductListItem[] = articles
      .slice(0, maxResults)
      .map((article, index) =>
        this.mapArticleToProductListItem(article, globalOffset + index + 1),
      )

    return {
      query: {
        ...params,
        keywords: query,
        page: pageNumber,
        maxResults,
      },
      total: apiResponse.total ?? articles.length,
      items,
    }
  }

  private normalizeQuery(rawKeywords: string): string {
    const normalizedQuery = rawKeywords.trim()
    if (!normalizedQuery) {
      throw new Error('RetailerSearchParams.keywords must be a non-empty string.')
    }
    return normalizedQuery
  }

  private resolvePageNumber(page: number | undefined): number {
    if (page === undefined) return 1
    if (!Number.isInteger(page) || page < 1) {
      throw new Error('RetailerSearchParams.page must be an integer greater than 0.')
    }
    return page
  }

  private resolveMaxResults(
    requestedMaxResults: number | undefined,
    pageSize: number,
  ): number {
    if (requestedMaxResults === undefined) return pageSize

    if (!Number.isInteger(requestedMaxResults) || requestedMaxResults < 1) {
      throw new Error(
        'RetailerSearchParams.maxResults must be an integer greater than 0.',
      )
    }
    if (requestedMaxResults > pageSize) {
      throw new Error(
        `RetailerSearchParams.maxResults must be <= ${pageSize}. Received: ${requestedMaxResults}.`,
      )
    }

    return requestedMaxResults
  }

  private async bootstrapSearchContext(query: string): Promise<void> {
    await this.page.goto(`${BASE_URL}/buscar/?query=${encodeURIComponent(query)}`, {
      waitUntil: 'domcontentloaded',
    })
  }

  private buildSearchApiUrl(params: SearchApiUrlParams): string {
    const url = new URL(API_BASE)
    url.searchParams.set('query', params.query)
    url.searchParams.set('sort', 'relevance')
    url.searchParams.set('sortVersion', 'default')
    url.searchParams.set('channel', 'es')
    url.searchParams.set('page', String(params.pageNumber))
    url.searchParams.set('pageSize', String(params.pageSize))
    url.searchParams.set('analytics', 'true')
    url.searchParams.set('showOem', 'false')
    return url.toString()
  }

  private mapArticleToProductListItem(
    article: ApiArticle,
    position: number,
  ): ProductListItem {
    const normalizedSlug = article.slug.replace(/^\/+/, '')

    return {
      id: article.id,
      name: article.name,
      price: this.resolveArticlePrice(article),
      position,
      url: `${BASE_URL}/${normalizedSlug}`,
      imageUrl: article.images?.medium?.path ?? article.images?.small?.path,
      category: article.mainCategory?.name,
    }
  }

  private resolveArticlePrice(article: ApiArticle): number {
    const candidatePrice = article.promotionalPrice ?? article.originalPrice
    const hasValidPrice =
      typeof candidatePrice === 'number' && Number.isFinite(candidatePrice)

    if (hasValidPrice) return candidatePrice

    this.logger.log('warn', 'PCC list item missing/invalid price (defaulting to 0)', {
      id: article.id,
      slug: article.slug,
      promotionalPrice: article.promotionalPrice,
      originalPrice: article.originalPrice,
    })

    return 0
  }

  private async fetchSearchApi(apiUrl: string): Promise<ApiResponse> {
    const maxAttempts = 3
    const baseDelayMs = 500
    const timeoutMs = 10_000

    let lastErr: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const apiResult = (await this.page.evaluate(
          async ({ apiUrl, timeoutMs }) => {
            const abortController = new AbortController()
            const abortTimeout = setTimeout(() => abortController.abort(), timeoutMs)

            try {
              const response = await fetch(apiUrl, {
                credentials: 'include',
                signal: abortController.signal,
                headers: {
                  accept: '*/*',
                  'accept-language': 'es-ES,es;q=0.9',
                  'content-language': 'es',
                  'x-selected-language': 'es_ES',
                },
              })

              if (!response.ok) {
                return {
                  __error: { status: response.status, text: await response.text() },
                }
              }

              return response.json()
            } finally {
              clearTimeout(abortTimeout)
            }
          },
          { apiUrl, timeoutMs },
        )) as ApiEvaluateResult

        if ('__error' in apiResult) {
          const { status, text } = apiResult.__error

          if (status === 429 || (status >= 500 && status <= 599)) {
            throw new Error(
              `Search API retryable error ${status}: ${text.slice(0, 200)}`,
            )
          }

          throw new Error(`Search API error ${status}: ${text.slice(0, 200)}`)
        }

        this.logger.log('debug', 'PCC search API success', {
          attempt,
          articles: apiResult.articles?.length ?? 0,
          total: apiResult.total,
        })
        return apiResult
      } catch (error: unknown) {
        lastErr = error
        this.logger.log('warn', 'PCC search API attempt failed', {
          attempt,
          maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        })
        if (attempt === maxAttempts) break
        const retryDelayMs = baseDelayMs * attempt
        await this.page.waitForTimeout(retryDelayMs)
      }
    }

    throw new Error(
      `PcComponentes search API failed after ${maxAttempts} attempts. Last error: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`,
    )
  }
}
