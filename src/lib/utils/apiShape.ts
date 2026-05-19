export function itemsFrom<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (!value || typeof value !== 'object') return []

  const obj = value as Record<string, unknown>
  for (const key of ['items', 'details', 'data', 'rows', 'children']) {
    const nested = obj[key]
    const items = itemsFrom<T>(nested)
    if (items.length) return items
  }

  return []
}
