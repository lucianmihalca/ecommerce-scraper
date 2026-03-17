export const toFiniteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

export const toNonNegativeInt = (value: unknown, fallback: number): number =>
  Math.max(0, Math.floor(toFiniteNumber(value, fallback)))

export const toPositiveInt = (value: unknown, fallback: number): number =>
  Math.max(1, Math.floor(toFiniteNumber(value, fallback)))
