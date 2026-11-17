import type { RenderElement } from 'claude-code'

import type { Ui } from '../../index'
import { scrollbar, scrollbarSize } from './scrollbar'

export type Stop = { key: string; onPress: () => void }

export type Line = { element: RenderElement; stops?: readonly Stop[] }

export type Span = { at: number; size: number }

type Viewport = { key: string; lines: readonly Line[]; rows: number; width: number; first: number }

const hiddenFace = ' '

export const viewportWidth = (width: number) => Math.max(1, width - scrollbarSize)

export const viewportFirst = (total: number, rows: number, first: number) => Math.max(0, Math.min(total - Math.max(1, rows), first))

export const viewportReveal = (total: number, rows: number, first: number, { at, size }: Span) => {
  const room = Math.max(1, rows)
  const end = Math.min(total, at + Math.max(1, size))

  return viewportFirst(total, room, Math.min(at, Math.max(first, end - room)))
}

export const isInViewport = (rows: number, first: number, { at }: Span) => at >= first && at < first + Math.max(1, rows)

export const viewport = (ui: Ui, { key, lines, rows, width, first }: Viewport): RenderElement => {
  const { Box, Button } = ui
  const room = Math.max(1, rows)
  const from = viewportFirst(lines.length, room, first)
  const bar = scrollbar(ui, { key: `${key}-bar`, rows: room, total: lines.length, first: from })
  const hidden = (edge: string, out: readonly Line[]) => {
    const stops = out.flatMap(line => line.stops ?? [])

    return stops.length === 0 ? [] : [Box({
      key: `${key}-${edge}`,
      position: 'absolute',
      top: 0,
      left: 0,
      height: 0,
      overflow: 'hidden',
      children: stops.map(stop => Button({ key: stop.key, plain: true, onPress: stop.onPress, children: hiddenFace })),
    })]
  }

  return Box({
    key,
    flexDirection: 'row',
    height: room,
    flexShrink: 0,
    overflow: 'hidden',
    children: [
      Box({
        flexDirection: 'column',
        width: viewportWidth(width),
        flexShrink: 0,
        children: [
          ...hidden('above', lines.slice(0, from)),
          ...lines.slice(from, from + room).map(line => Box({ flexDirection: 'column', height: 1, flexShrink: 0, overflow: 'hidden', children: line.element })),
          ...hidden('below', lines.slice(from + room)),
        ],
      }),
      ...(bar ? [bar] : []),
    ],
  })
}
