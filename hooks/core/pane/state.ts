import type { EngineInterface, RenderInput, UiPane } from 'claude-code'

import { framedPane } from './frame'
import type { FrameSpec } from './frame'
import { isPaneShown, placePane } from './open'
import type { PaneSpec, Panes } from './open'

export type PaneState = { isShown: boolean; isFocused: boolean }

export const hiddenPane = (): PaneState => ({ isShown: false, isFocused: false })

export const hidePaneState = (state: PaneState) => {
  state.isShown = false
  state.isFocused = false
}

export const notePaneState = (state: PaneState, panes: readonly UiPane[], id: string) => {
  const shown = panes.find(pane => pane.id === id && pane.isShown)
  state.isShown = shown !== undefined
  state.isFocused = shown?.isFocused ?? false
}

export const createMoveGuard = () => {
  let isMoving = false
  return async (move: () => Promise<void>) => {
    if (isMoving) return
    isMoving = true
    try {
      await move()
    } finally {
      isMoving = false
    }
  }
}

export async function showPaneState($: EngineInterface, panes: Panes, spec: PaneSpec, state: PaneState, isCurrent: () => boolean = () => true) {
  const placed = await placePane($, panes, spec)
  if (placed === null || !isCurrent()) return null
  if (!placed) {
    hidePaneState(state)
    return false
  }
  const shown = await $.ui.panes()
  if (!isCurrent()) return null
  notePaneState(state, shown, spec.id)
  $.ui.invalidate('ui.render')
  return true
}

export function closePaneState($: EngineInterface, spec: PaneSpec, state: PaneState) {
  hidePaneState(state)
  return $.ui.close({ id: spec.id })
}

export async function shownFrame($: EngineInterface, e: RenderInput<'Pane'>, panes: Panes, spec: FrameSpec, state: PaneState) {
  if (!(await isPaneShown($, spec.id))) {
    hidePaneState(state)
    return null
  }
  state.isShown = true
  state.isFocused = e.props.isFocused
  return framedPane(panes, spec, $.ui.resolve(e), e.props)
}
