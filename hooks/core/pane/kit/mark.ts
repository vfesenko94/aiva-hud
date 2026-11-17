import type { Color, TextProps } from 'claude-code'

import { cut } from '../../format'
import type { Ui } from '../../index'
import { pressable } from './pressable'
import type { Control, Part } from './pressable'

export type Mark = { open: string; close: string; on: string; off: string; gap: number; color: Color | null; boldLabel: boolean }

export type Marked = Omit<Control, 'onPress' | 'dim' | 'inert'> & { label: string; checked: boolean; disabled?: boolean; note?: string }

const glyphSize = (mark: Mark) => mark.open.length + Math.max(mark.on.length, mark.off.length) + mark.close.length

const gapOf = (mark: Mark, label: string) => label ? mark.gap : 0

export const markedSize = (mark: Mark, { label, note }: Pick<Marked, 'label' | 'note'>) =>
  glyphSize(mark) + gapOf(mark, label) + label.length + (note ? 1 + note.length : 0)

const fitted = (mark: Mark, { label, note, width }: Pick<Marked, 'label' | 'note' | 'width'>) => {
  if (width >= markedSize(mark, { label, note })) return { label, note }
  return { label: cut(label, width - glyphSize(mark) - gapOf(mark, label)), note: undefined }
}

export const marked = (ui: Ui, mark: Mark, control: Marked, onPress: () => void) => {
  const { Text } = ui
  const { label, note } = fitted(mark, control)
  const isLit = control.checked && !control.disabled
  const markStyle: TextProps = isLit && mark.color ? { color: mark.color, bold: true } : { bold: true }
  const parts: Part[] = [
    Text({ ...markStyle, children: `${mark.open}${control.checked ? mark.on : mark.off}${mark.close}` }),
    ...(label ? [' '.repeat(gapOf(mark, label)), isLit && mark.boldLabel ? Text({ bold: true, children: label }) : label] : []),
    ...(note ? [' ', Text({ dimColor: true, children: note })] : []),
  ]
  if (control.disabled) return Text({ dimColor: true, children: parts })
  return pressable(ui, { key: control.key, selected: control.selected, width: control.width, onPress }, parts)
}
