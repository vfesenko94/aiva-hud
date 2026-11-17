import type { Color, RenderElement } from 'claude-code'

import { cut } from '../../format'
import type { Ui } from '../../index'
import type { Step } from './grid'
import { pressable } from './pressable'
import type { Control, Part } from './pressable'

export type CycleOption<T extends string = string> = { value: T; label: string }

export type Cycle<T extends string = string> = Omit<Control, 'onPress'> & {
  label: string
  labelWidth?: number
  options: readonly CycleOption<T>[]
  value: T
  onChange: (value: T) => void
  wrap?: boolean
  fit?: boolean
  disabled?: boolean
  color?: Color
}

const previous = '‹'

const next = '›'

const separator = ': '

const pad = 1

const labelOf = (options: readonly CycleOption[], value: string) => options.find(option => option.value === value)?.label ?? value

const valueRoom = ({ options, value, fit }: Pick<Cycle, 'options' | 'value' | 'fit'>) =>
  Math.max(1, ...(fit ? [labelOf(options, value).length] : options.map(option => option.label.length)))

const faceSize = (room: number) => previous.length + pad + room + pad + next.length

const headOf = ({ label, labelWidth = 0 }: Pick<Cycle, 'label' | 'labelWidth'>) => label ? `${label}${separator}`.padEnd(labelWidth) : ''

export const cycleSize = (control: Pick<Cycle, 'label' | 'labelWidth' | 'options' | 'value' | 'fit'>) => headOf(control).length + faceSize(valueRoom(control))

export const cycleStep = <T extends string>({ options, value, wrap = true }: Pick<Cycle<T>, 'options' | 'value' | 'wrap'>, step: Step): T => {
  const at = Math.max(0, options.findIndex(option => option.value === value))
  const to = wrap ? (at + step + options.length) % options.length : Math.max(0, Math.min(options.length - 1, at + step))
  return options[to]?.value ?? value
}

const centered = (text: string, room: number) => {
  const shown = text.length > room ? cut(text, room) || text.slice(0, room) : text
  const left = Math.floor((room - shown.length) / 2)
  return `${' '.repeat(left)}${shown}${' '.repeat(room - shown.length - left)}`
}

const fitted = (control: Pick<Cycle, 'label' | 'labelWidth' | 'options' | 'value' | 'fit' | 'width'>) => {
  const room = valueRoom(control)
  const head = headOf(control)
  if (control.width >= head.length + faceSize(room)) return { head, room }
  const labelRoom = control.width - faceSize(room) - separator.length
  if (labelRoom > 1) return { head: `${cut(control.label, labelRoom)}${separator}`, room }
  return { head: '', room: Math.max(1, Math.min(room, control.width - faceSize(0))) }
}

export const cycle = <T extends string>(ui: Ui, control: Cycle<T>): RenderElement => {
  const { Box, Text } = ui
  const { options, value, wrap = true } = control
  const at = options.findIndex(option => option.value === value)
  const isFixed = control.disabled || options.length < 2
  const { head, room } = fitted(control)
  const arrow = (glyph: string, isEdge: boolean) => Text({ bold: !isEdge, dimColor: isEdge, children: glyph })
  const gap = ' '.repeat(pad)
  const face: Part[] = [
    arrow(previous, isFixed || (!wrap && at <= 0)),
    Text({ bold: !isFixed, ...(control.color && !isFixed ? { color: control.color } : {}), children: `${gap}${centered(labelOf(options, value), room)}${gap}` }),
    arrow(next, isFixed || (!wrap && at >= options.length - 1)),
  ]
  const onPress = () => control.onChange(cycleStep({ options, value, wrap: true }, 1))
  return Box({
    flexDirection: 'row',
    children: [
      ...(head ? [Text({ dimColor: isFixed, children: head })] : []),
      isFixed ? Text({ dimColor: true, children: face }) : pressable(ui, { ...control, onPress }, face),
    ],
  })
}
