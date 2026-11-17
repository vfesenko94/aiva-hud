import type { Span } from '../../../core'
import type { Navigation } from './tree'

export type Move = { kind: 'expand' | 'collapse' | 'focus'; key: string }

type View = { first: number; rows: number; spans: ReadonlyMap<string, Span> }

export const isWalkable = (navigation: Navigation, key: string | null) => key !== null && navigation.nodes.has(key)

export const visibleRow = (navigation: Navigation, view: View, at: number) => {
  const target = Math.max(view.first, Math.min(view.first + Math.max(1, view.rows) - 1, at))
  let nearest: string | undefined
  let distance = Infinity
  for (const key of navigation.order) {
    const span = view.spans.get(key)
    if (!isWalkable(navigation, key) || !span || span.at < view.first || span.at >= view.first + Math.max(1, view.rows)) continue
    const gap = Math.abs(span.at - target)
    if (gap < distance) {
      nearest = key
      distance = gap
    }
  }
  return nearest
}

export const verticalMove = (navigation: Navigation, focused: string | null, direction: 'up' | 'down', view: View) => {
  const order = navigation.order.filter(key => isWalkable(navigation, key))
  const span = focused ? view.spans.get(focused) : undefined
  if (!span || span.at < view.first || span.at >= view.first + Math.max(1, view.rows)) {
    const visible = visibleRow(navigation, view, direction === 'down' ? view.first : view.first + view.rows - 1)
    if (visible) return visible
  }
  const at = order.indexOf(focused ?? '')

  return order[Math.max(0, Math.min(order.length - 1, at + (direction === 'down' ? 1 : -1)))]
}

export const arrowMove = (navigation: Navigation, focused: string | null, direction: 'left' | 'right'): Move | null => {
  if (focused === null) return null
  const node = navigation.nodes.get(focused)
  if (!node) return null
  if (direction === 'right') {
    if (node.isOpen === false) return { kind: 'expand', key: focused }
    return node.firstChild ? { kind: 'focus', key: node.firstChild } : null
  }
  if (node.isOpen) return { kind: 'collapse', key: focused }

  return node.parent ? { kind: 'focus', key: node.parent } : null
}
