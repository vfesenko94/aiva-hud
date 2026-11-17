import type { Ui } from '../../index'
import { marked, markedSize } from './mark'
import type { Mark, Marked } from './mark'

type Checkbox = Marked & { onToggle: () => void }

const mark: Mark = { open: '[', close: ']', on: 'x', off: ' ', gap: 2, color: 'success', boldLabel: false }

export const checkboxGlyph = (checked: boolean) => `${mark.open}${checked ? mark.on : mark.off}${mark.close}`

export const checkboxSize = (item: Pick<Marked, 'label' | 'note'>) => markedSize(mark, item)

export const checkbox = (ui: Ui, control: Checkbox) => marked(ui, mark, control, control.onToggle)
