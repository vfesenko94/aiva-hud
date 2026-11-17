import type { Color, RenderElement } from 'claude-code'

import type { Ui } from '../../index'

export type Control = { key: string; selected: boolean; width: number; onPress: () => void; dim?: boolean; inert?: boolean }

export type Part = string | RenderElement

const cellOf = (key: string) => `${key}-cell`

const ignore = () => undefined

export const pressable = ({ Box, Button, Text }: Ui, { key, selected, onPress, dim, inert }: Control, children: Part | Part[], color: Color = 'text'): RenderElement =>
  Box({
    key: cellOf(key),
    children: Button({
      key,
      plain: true,
      ...(selected ? { autoFocus: true as const } : {}),
      onPress: inert ? ignore : onPress,
      children: Text({ color, inverse: selected, dimColor: (!!dim || !!inert) && !selected, children }),
    }),
  })
