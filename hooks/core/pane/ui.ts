import type { Ui } from '../index'

export const paneUi = (ui: Ui, isFocused: boolean): Ui => isFocused ? ui : {
  ...ui,
  Text: props => ui.Text({
    ...props,
    color: 'inactive',
    dimColor: true,
    bold: false,
    weight: 'regular',
    inverse: false,
    backgroundColor: undefined,
    hover: props.hover ? { ...props.hover, color: 'inactive', dimColor: true, bold: false, inverse: false } : undefined,
  }),
}
