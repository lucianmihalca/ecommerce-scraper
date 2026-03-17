import type { Page } from 'playwright'
import type { ProductListItem } from '../../../models/ProductListItem'
import type { ProductListResult } from '../../../models/ProductListResult'
import type { RetailerSearchParams } from '../../../models/RetailerSearchParams'
import { type Logger, silentLogger } from '../../../utils/logger'
import type { BrowserNavigator } from '../../../navigator/BrowserNavigator'
import { BASE_URL, MAX_API_PAGE_SIZE } from '../constants'
import {
  normalizeQuery,
  resolvePageNumber,
  resolveMaxResults,
  buildSearchApiUrl,
  mapArticleToProductListItem,
  type ApiResponse,
  type ApiEvaluateResult,
  type ApiErrorPayload,
} from './ListScraper.helpers'

export class ListScraper {
  constructor(
    private readonly navigator: BrowserNavigator,
    private readonly page: Page,
    private readonly logger: Logger = silentLogger,
  ) {}

  async scrape(params: RetailerSearchParams): Promise<ProductListResult> {
    const pageNumber = resolvePageNumber(params.page)
    const query = normalizeQuery(params.keywords)

    const maxResults = resolveMaxResults(params.maxResults, MAX_API_PAGE_SIZE)
    const pageSize = maxResults

    this.logger.log('debug', 'PCC list scraper start', {
      query,
      page: pageNumber,
      maxResults,
    })

    await this.navigator.waitRequestDelay()
    await this.openSearchPageForSession(query)

    const apiUrl = buildSearchApiUrl({
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
        mapArticleToProductListItem(article, globalOffset + index + 1, this.logger),
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

  // Open the search page first so in-page API calls inherit the browser context
  // and Cloudflare/session cookies.
  private async openSearchPageForSession(query: string): Promise<void> {
    await this.navigator.gotoWithRetry(
      this.page,
      `${BASE_URL}/buscar/?query=${encodeURIComponent(query)}`,
      { waitUntil: 'domcontentloaded' },
    )
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
          throw this.toSearchApiError(apiResult.__error)
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

  private toSearchApiError(apiError: ApiErrorPayload['__error']): Error {
    const message = apiError.text.slice(0, 200)

    if (apiError.status === 429 || (apiError.status >= 500 && apiError.status <= 599)) {
      return new Error(`Search API retryable error ${apiError.status}: ${message}`)
    }

    return new Error(`Search API error ${apiError.status}: ${message}`)
  }
}
