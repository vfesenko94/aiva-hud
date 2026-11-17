export type Direction = 'left' | 'right' | 'up' | 'down'

export type Step = -1 | 1

export type Cell = { key: string; row: number; column: number; step?: (by: Step) => void }

export const stepOf = (direction: Direction): Step | null => direction === 'left' ? -1 : direction === 'right' ? 1 : null

export const gridMove = (cells: readonly Cell[], selected: string, direction: Direction): string => {
  const current = cells.find(cell => cell.key === selected)
  if (!current) return cells[0]?.key ?? selected
  const horizontal = direction === 'left' || direction === 'right'
  const step = direction === 'left' || direction === 'up' ? -1 : 1
  const candidates = cells.filter(cell => horizontal
    ? cell.row === current.row && (cell.column - current.column) * step > 0
    : (cell.row - current.row) * step > 0)
  candidates.sort((a, b) => horizontal
    ? Math.abs(a.column - current.column) - Math.abs(b.column - current.column)
    : Math.abs(a.row - current.row) - Math.abs(b.row - current.row) || Math.abs(a.column - current.column) - Math.abs(b.column - current.column))
  return candidates[0]?.key ?? selected
}
