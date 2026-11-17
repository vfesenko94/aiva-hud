import type { UiScrollInput } from 'claude-code'

import type { Direction } from './kit'

export const scrollIntent = (e: UiScrollInput): Direction | null => {
  if (e.origin.kind !== 'person' || e.pointer) return null
  if (e.contentRows > 0 && Math.abs(e.by) === e.contentRows) return e.by > 0 ? 'right' : 'left'
  if (Math.abs(e.by) === 1) return e.by > 0 ? 'down' : 'up'
  return null
}
