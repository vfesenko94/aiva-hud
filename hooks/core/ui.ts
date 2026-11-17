import type { ElementTable, RenderElement } from 'claude-code'

export type Ui = Pick<ElementTable, 'Box' | 'Button' | 'Text'>

export type Block = {
  id: string
  label: RenderElement
  gap?: RenderElement
  overlay?: RenderElement | false | null
  action?: string
  isPressable: boolean
}
