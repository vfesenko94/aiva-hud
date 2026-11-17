import { cut } from '../../format'
import type { Ui } from '../../index'
import { pressable } from './pressable'
import type { Control } from './pressable'

const glyph = '›'

const faceOf = (label: string) => `[ ${label} ${glyph} ]`

export const choiceSize = (label: string) => faceOf(label).length

export const choice = (ui: Ui, control: Control & { label: string }) =>
  pressable(ui, control, cut(faceOf(control.label), control.width))
