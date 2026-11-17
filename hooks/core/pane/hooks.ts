import type { On } from 'claude-code'

import { focusElement, openPane, stepBack } from './open'
import type { PaneSpec, Panes } from './open'

type PaneBack = { run: () => void; focus?: string }

type PaneClose = { isOn: () => boolean; back: () => PaneBack | null; closed: () => void }

export const registerPanePress = (on: On, state: Panes, spec: PaneSpec, isOn: () => boolean) => {
  on('ui.press', { requestId: spec.id }, async ($, e, next) => {
    if (!isOn() || state.focused.has(spec.id)) return next(e)
    const claim = openPane($, state, spec).catch(() => null)
    const pressed = await next(e)
    if ((await claim)?.isPlaced) await focusElement($, spec.id, e.element)
    return pressed
  })
}

export const registerPaneClose = (on: On, state: Panes, spec: PaneSpec, { isOn, back, closed }: PaneClose) => {
  on('ui.close', { id: spec.id }, async ($, e, next) => {
    if (!isOn()) return next(e)
    const step = back()
    if (await stepBack($, state, e, spec, step?.run ?? null)) {
      if (step?.focus) await focusElement($, spec.id, step.focus)
      return { value: undefined }
    }
    const result = await next(e)
    closed()
    return result
  })
}
