import type { Color } from 'claude-code'

import { cut } from '../../format'
import type { Ui } from '../../index'
import { pressable } from './pressable'
import type { Control } from './pressable'

const faceOf = (label: string) => `[ ${label} ]`

export const buttonSize = (label: string) => faceOf(label).length

export const button = (ui: Ui, control: Control & { label: string; color?: Color }) =>
  pressable(ui, control, cut(faceOf(control.label), control.width), control.color)
