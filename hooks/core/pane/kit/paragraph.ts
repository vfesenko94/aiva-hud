import type { Color, RenderElement } from 'claude-code'

import type { Ui } from '../../index'
import type { StackRow } from './stack'

type Paragraph = { key: string; text: string; lead?: string; width: number; rows: number; color?: Color; dim?: boolean }

type Placed = { element: RenderElement | null; rows: number }

export const paragraphRows = ({ text, lead = '', width, rows }: Pick<Paragraph, 'text' | 'lead' | 'width' | 'rows'>) =>
  Math.max(0, Math.min(rows, Math.ceil((lead.length + text.length) / Math.max(1, width))))

export const paragraph = ({ Box, Text }: Ui, { key, text, lead, width, rows, color, dim }: Paragraph): Placed => {
  const height = paragraphRows({ text, lead, width, rows })
  if (height === 0) return { element: null, rows: 0 }
  return {
    rows: height,
    element: Box({
      key,
      height,
      flexShrink: 0,
      overflow: 'hidden',
      children: Text({
        wrap: 'wrap',
        children: [
          ...(lead ? [Text({ bold: true, children: lead })] : []),
          Text({ ...(color ? { color } : {}), dimColor: !!dim, children: text }),
        ],
      }),
    }),
  }
}

export const paragraphRow = (ui: Ui, { priority, minRows, ...props }: Paragraph & Pick<StackRow, 'priority' | 'minRows'>): StackRow => ({
  priority,
  rows: paragraphRows(props),
  ...(minRows === undefined ? {} : { minRows }),
  draw: rows => paragraph(ui, { ...props, rows }).element,
})
