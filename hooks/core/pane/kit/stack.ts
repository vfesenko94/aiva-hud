import type { RenderElement } from 'claude-code'

import type { Ui } from '../../index'

export type StackRow = { priority: number; rows: number; minRows?: number; stop?: string; draw: (rows: number) => RenderElement | null }

type StackProps = { rows: readonly StackRow[]; room: number; width?: number }

type Stack = { rows: number; stops: string[]; draw: () => RenderElement }

export const stack = ({ Box }: Ui, { rows, room, width }: StackProps): Stack => {
  const given = new Map<StackRow, number>()
  let left = Math.max(0, room)
  for (const row of [...rows].sort((a, b) => a.priority - b.priority)) {
    const give = Math.min(row.rows, left)
    if (give < Math.min(row.rows, row.minRows ?? row.rows)) continue
    given.set(row, give)
    left -= give
  }
  const kept = rows.filter(row => given.has(row))
  return {
    rows: Math.max(0, room) - left,
    stops: kept.flatMap(row => row.stop ? [row.stop] : []),
    draw: () => Box({
      flexDirection: 'column',
      ...(width === undefined ? {} : { width }),
      children: kept.flatMap(row => {
        const element = row.draw(given.get(row) ?? row.rows)
        return element ? [element] : []
      }),
    }),
  }
}
