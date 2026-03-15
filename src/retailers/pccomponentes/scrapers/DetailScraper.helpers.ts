import { BASE_URL } from '../constants'

/**
 * Converts a relative or absolute product URL to a full absolute URL.
 */
export function resolveAbsoluteUrl(url: string): string {
  return url.startsWith('http') ? url : `${BASE_URL}${url}`
}

/**
 * Detects low-quality JSON-LD descriptions that should be replaced
 * with a DOM fallback. Catches:
 * - Empty descriptions
 * - CSS-contaminated content (e.g. @font-face, font-family)
 * - Product name repeated multiple times (common bad JSON-LD)
 */
export function isLowQualityDescription(
  description: string,
  productName: string,
): boolean {
  const normalizedDescription = description.trim().toLowerCase()
  const normalizedName = productName.trim().toLowerCase()

  if (!normalizedDescription) return true

  const cssLikeBlockPattern = /\{[^}]*:[^}]*\}/
  const containsCssMarkers =
    normalizedDescription.startsWith('@font-face') ||
    normalizedDescription.includes('font-family') ||
    normalizedDescription.includes('src: url(') ||
    cssLikeBlockPattern.test(normalizedDescription)

  if (containsCssMarkers) return true

  if (normalizedName) {
    const occurrences = normalizedDescription.split(normalizedName).length - 1
    if (occurrences >= 2) return true
  }

  return false
}
