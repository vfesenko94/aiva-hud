import type { PromptEditInput } from 'claude-code'

type NavAction = 'previous' | 'next' | 'press' | 'exit' | 'pass'

export type Nav = { isActive: boolean; selected: string; items: readonly string[]; pressable: readonly string[]; pending: string | null }

const SUBMIT_FILLER = '⠀⠀'
const NEWLINE_FILLER = '\\⠀'

export const fillerFor = (submits: boolean) => (submits ? SUBMIT_FILLER : NEWLINE_FILLER)

export const isFiller = (text: string) => text === SUBMIT_FILLER || text === NEWLINE_FILLER

export const idleNav = (): Nav => ({ isActive: false, selected: '', items: [], pressable: [], pending: null })

export const keepSelection = (nav: Nav, items: readonly string[], pressable: readonly string[]) => {
  nav.items = items
  nav.pressable = pressable
  if (!items.includes(nav.selected)) nav.selected = items[0] ?? ''
}

export const moveSelection = (items: readonly string[], selected: string, by: 1 | -1) => {
  const at = Math.max(items.indexOf(selected), 0)

  return items[(at + by + items.length) % items.length] ?? selected
}

export const navAction = ({ key, inputText }: Pick<PromptEditInput, 'key' | 'inputText'>): NavAction => {
  if (inputText.includes('\n')) return 'press'
  if (!key || key.ctrl || key.meta || key.shift) return 'pass'
  if (key.key === 'left') return 'previous'
  if (key.key === 'right') return 'next'
  if (key.key === 'space' || key.key === ' ') return 'press'

  return key.key === 'escape' ? 'exit' : 'pass'
}
