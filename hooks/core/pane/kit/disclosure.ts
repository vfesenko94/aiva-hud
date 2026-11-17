import type { Color, RenderElement, TextHoverProps } from 'claude-code'

import { cut } from '../../format'
import type { Ui } from '../../index'
import type { Part } from './pressable'

type Disclosure = {
  key: string
  isOpen: boolean
  label: string
  labelWidth?: number
  fill?: string
  value?: string
  valueWidth?: number
  tail?: Part[]
  indent?: number
  bold?: boolean
  dim?: boolean
  color?: Color
  hover?: TextHoverProps
  onPress: () => void
}

const open = '[−]'

const closed = '[+]'

const separator = ' '

export const disclosureMark = (isOpen: boolean) => isOpen ? open : closed

const fitted = (text: string, width: number | undefined, fill = ' ') => width === undefined ? text : cut(text, width).padEnd(width, fill)

export const disclosure = ({ Button, Text }: Ui, control: Disclosure): RenderElement => {
  const { key, isOpen, label, labelWidth, fill, value, valueWidth = 0, tail = [], indent = 0, bold, dim, color, hover, onPress } = control
  return Button({
    key,
    plain: true,
    ...(dim ? { dimColor: true } : {}),
    ...(hover ? { hover } : {}),
    onPress,
    children: [
      ...(indent > 0 ? [Text({ dimColor: true, children: ' '.repeat(indent) })] : []),
      Text({ dimColor: true, children: disclosureMark(isOpen) }),
      Text({ ...(bold ? { bold: true } : {}), ...(color ? { color } : {}), children: `${separator}${fitted(label, labelWidth, fill)}` }),
      ...(value === undefined ? [] : [Text({ children: value.padStart(valueWidth) })]),
      ...tail,
    ],
  })
}
