import type { ProductListItem } from '../../../models/ProductListItem'
import type { Logger } from '../../../utils/logger'
import { API_BASE, BASE_URL, MAX_API_PAGE_SIZE } from '../constants'

// -------------------------
// API types
// -------------------------

export type ApiArticleImage = {
  path: string
  width: number
  height: number
}

export type ApiArticle = {
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

export type ApiResponse = {
  articles?: ApiArticle[]
  total?: number
}

export type ApiErrorPayload = {
  __error: {
    status: number
    text: string
  }
}
export type ApiEvaluateResult = ApiResponse | ApiErrorPayload

export type SearchApiUrlParams = {
  query: string
  pageNumber: number
  pageSize: number
}

// -------------------------
// Validation
// -------------------------

export function normalizeQuery(rawKeywords: string): string {
  const normalizedQuery = rawKeywords.trim()
  if (!normalizedQuery) {
    throw new Error('RetailerSearchParams.keywords must be a non-empty string.')
  }
  return normalizedQuery
}

export function resolvePageNumber(page: number | undefined): number {
  if (page === undefined) return 1
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('RetailerSearchParams.page must be an integer greater than 0.')
  }
  return page
}

export function resolveMaxResults(
  requestedMaxResults: number | undefined,
  maxAllowedResults: number = MAX_API_PAGE_SIZE,
): number {
  if (requestedMaxResults === undefined) return maxAllowedResults

  if (!Number.isInteger(requestedMaxResults) || requestedMaxResults < 1) {
    throw new Error(
      'RetailerSearchParams.maxResults must be an integer greater than 0.',
    )
  }
  if (requestedMaxResults > maxAllowedResults) {
    throw new Error(
      `RetailerSearchParams.maxResults must be <= ${maxAllowedResults}. Received: ${requestedMaxResults}.`,
    )
  }

  return requestedMaxResults
}

// -------------------------
// Data transformation
// -------------------------

export function resolveArticlePrice(article: ApiArticle, logger?: Logger): number {
  const candidatePrice = article.promotionalPrice ?? article.originalPrice
  const hasValidPrice =
    typeof candidatePrice === 'number' && Number.isFinite(candidatePrice)

  if (hasValidPrice) return candidatePrice

  logger?.log('warn', 'PCC list item missing/invalid price (defaulting to 0)', {
    id: article.id,
    slug: article.slug,
    promotionalPrice: article.promotionalPrice,
    originalPrice: article.originalPrice,
  })

  return 0
}

export function mapArticleToProductListItem(
  article: ApiArticle,
  position: number,
  logger?: Logger,
): ProductListItem {
  const normalizedSlug = article.slug.replace(/^\/+/, '')

  return {
    id: article.id,
    name: article.name,
    price: resolveArticlePrice(article, logger),
    position,
    url: `${BASE_URL}/${normalizedSlug}`,
    imageUrl: article.images?.medium?.path ?? article.images?.small?.path,
    category: article.mainCategory?.name,
  }
}

export function buildSearchApiUrl(params: SearchApiUrlParams): string {
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
