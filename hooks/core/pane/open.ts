import type { EngineInterface, PaneCloseInput } from 'claude-code'

import { createKeys } from '../keys'
import type { Keys } from '../keys'
import { paneConfig } from './config'

export type Panes = { generation: number; focused: Set<string>; readonly keys: Readonly<Keys> }

export type PaneSpec = { id: string; title: string; rows: number }

export const createPanes = (keys: Readonly<Keys> = createKeys()): Panes => ({ generation: 0, focused: new Set(), keys })

const paneArgs = ({ id, title, rows }: PaneSpec) => ({ id, title, rows, focus: true as const, closeOnEscape: true as const })

export const noteFocus = (state: Panes, id: string, isFocused: boolean) => {
  if (isFocused) state.focused.add(id)
  else state.focused.delete(id)
}

export async function isPaneShown($: EngineInterface, id: string) {
  return (await $.ui.panes()).some(pane => pane.id === id && pane.isShown)
}

export async function openPane($: EngineInterface, state: Panes, spec: PaneSpec) {
  const generation = ++state.generation
  const opened = await $.ui.open(paneArgs(spec))
  if (generation !== state.generation) return null
  if (!opened.isPlaced) return opened
  const panes = await $.ui.panes()
  for (const pane of panes) {
    if (generation !== state.generation) return null
    if (pane.id === spec.id) continue
    state.focused.delete(pane.id)
    await $.ui.close({ id: pane.id })
  }
  return generation === state.generation ? opened : null
}

async function claimFocus($: EngineInterface, state: Panes, spec: PaneSpec) {
  const generation = state.generation
  const isUnfocused = async () => (await $.ui.panes()).some(pane => pane.id === spec.id && pane.isShown && !pane.isFocused)
  if (!(await isUnfocused())) return
  await $.clock.sleep(paneConfig.focusRetryMs)
  if (generation === state.generation && (await isUnfocused())) await openPane($, state, spec)
}

export async function placePane($: EngineInterface, state: Panes, spec: PaneSpec) {
  const opened = await openPane($, state, spec)
  if (!opened) return null
  if (!opened.isPlaced) $.ui.toast(`${spec.title} pane did not open: ${opened.reason}`)
  else void claimFocus($, state, spec).catch(() => undefined)
  return opened.isPlaced
}

export async function focusElement($: EngineInterface, id: string, key: string) {
  const moved = await $.ui.focus({ requestId: id, key }).catch(() => null)
  return moved !== null && moved.deny === undefined
}

export async function stepBack($: EngineInterface, state: Panes, e: PaneCloseInput, spec: PaneSpec, back: (() => void) | null) {
  if (e.origin.kind !== 'person' || !back) return false
  back()
  $.ui.invalidate('ui.render')
  await openPane($, state, spec)
  return true
}
