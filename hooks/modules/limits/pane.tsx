import type { EngineInterface, On, RenderInput, UiPane } from 'claude-code'

import { closePaneState, hidePaneState, notePaneState, registerPaneClose, showPaneState, shownFrame } from '../../core'
import { limitsConfig } from './config'
import type { Limits } from './index'
import { limitsUsage } from './index'
import { limitsView } from './view'

export const isLimitsShown = (limits: Limits) => limits.visibility.isShown

export function closeLimits($: EngineInterface, limits: Limits) {
  return closePaneState($, limitsConfig, limits.visibility)
}

export function noteLimits(limits: Limits, panes: readonly UiPane[]) {
  notePaneState(limits.visibility, panes, limitsConfig.id)
}

export async function showLimits($: EngineInterface, limits: Limits) {
  await showPaneState($, limits.panes, limitsConfig, limits.visibility)
}

export function activateLimits($: EngineInterface, limits: Limits) {
  return limits.visibility.isShown ? closeLimits($, limits) : showLimits($, limits)
}

async function renderLimits($: EngineInterface, limits: Limits, e: RenderInput<'Pane'>) {
  const pane = await shownFrame($, e, limits.panes, limitsConfig, limits.visibility)
  if (!pane) return $.ui.resolve(e).Box({})
  const usage = await limitsUsage($, limits, await $.session.usage())
  const now = await $.clock.now()
  return pane.frame(limitsView(pane.ui, { usage, tracking: limits.tracking, config: limits.config, now, width: e.props.bodyColumns, rows: pane.rows }))
}

export const registerLimitsPane = (on: On, limits: Limits, isOn: () => boolean) => {
  registerPaneClose(on, limits.panes, limitsConfig, {
    isOn,
    back: () => null,
    closed: () => hidePaneState(limits.visibility),
  })

  on('ui.scroll', { requestId: limitsConfig.id }, ($, e, next) => (isOn() && e.origin.kind === 'person' ? {} : next(e)))

  on('ui.render', { component: 'Pane', requestId: limitsConfig.id }, ($, e, next) => (isOn() ? renderLimits($, limits, e) : next(e)))
}
