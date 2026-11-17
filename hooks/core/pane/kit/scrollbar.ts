import type { RenderElement } from 'claude-code'

import type { Ui } from '../../index'

type Scrollbar = { key: string; rows: number; total: number; first: number }

const track = '│'

const thumb = '┃'

export const scrollbarSize = track.length

export const scrollbar = ({ Box, Text }: Ui, { key, rows, total, first }: Scrollbar): RenderElement | null => {
  if (rows < 1 || total <= rows) return null
  const size = Math.max(1, Math.round((rows * rows) / total))
  const start = Math.min(rows - size, Math.round((first * (rows - size)) / (total - rows)))
  return Box({
    key,
    flexDirection: 'column',
    width: scrollbarSize,
    flexShrink: 0,
    children: Array.from({ length: rows }, (_, at) => at >= start && at < start + size ? Text({ children: thumb }) : Text({ dimColor: true, children: track })),
  })
}
