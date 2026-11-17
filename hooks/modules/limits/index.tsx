import type { EngineInterface, On, SessionRateLimit, SessionUsage } from 'claude-code'

import { center, duration, hiddenPane, levelColor } from '../../core'
import type { Block, Display, HudConfig, LimitFormat, PaneState, Panes, Ui } from '../../core'
import { limitsConfig } from './config'
import { registerLimitsPane } from './pane'
import { freshTracking, refreshReading, shareReading } from './shared'
import type { Tracking } from './shared'

export { limitsConfig } from './config'
export { activateLimits, closeLimits, isLimitsShown, noteLimits, showLimits } from './pane'
export type { Tracking } from './shared'

type Window = keyof typeof limitsConfig.windows

type Reading = { lead: string; value: string }

export type Limits = { readonly config: HudConfig; readonly panes: Panes; visibility: PaneState; tracking: Tracking }

export const createLimits = (config: HudConfig, panes: Panes): Limits => ({ config, panes, visibility: hiddenPane(), tracking: freshTracking() })

export const resetLimits = (limits: Limits) => {
  limits.tracking = freshTracking()
}

export async function noteLimitsReading($: EngineInterface, limits: Limits, measured?: readonly SessionRateLimit[]) {
  const tracking = limits.tracking
  const at = await $.clock.now()
  const rateLimits = [...(measured ?? (await $.session.usage()).rateLimits)]
  if (limits.tracking !== tracking || rateLimits.length === 0) return
  await shareReading($, tracking, { seenAt: at, rateLimits }, () => limits.tracking === tracking)
  if (limits.tracking !== tracking) return
  $.ui.invalidate('ui.render')
}

export async function limitsUsage($: EngineInterface, limits: Limits, usage: SessionUsage): Promise<SessionUsage> {
  const tracking = limits.tracking
  await refreshReading($, tracking, () => limits.tracking === tracking)
  return limits.tracking === tracking && tracking.reading ? { ...usage, rateLimits: tracking.reading.rateLimits } : usage
}

export async function limitBlock($: EngineInterface, limits: Limits, { Text }: Ui, usage: SessionUsage, window: Window, display: Display<LimitFormat>): Promise<Block | null> {
  const { kind, label } = limitsConfig.windows[window]
  const limit = usage.rateLimits.find(one => one.kind === kind)
  if (!limit) return null

  const resetAt = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
  const now = await $.clock.now()
  const isVoid = Number.isFinite(resetAt) && now >= resetAt
  const countdown = Number.isFinite(resetAt) ? duration(resetAt - now) : limitsConfig.missing
  const readingOf = (format: LimitFormat): Reading => {
    if (format === 'countdown') return { lead: '', value: countdown }
    const value = isVoid ? limitsConfig.missing : format === 'labeledFraction' || format === 'fraction' ? `${limit.percentUsed}/100` : `${limit.percentUsed}%`
    return { lead: format === 'labeled' || format === 'labeledFraction' ? `${label} ` : '', value }
  }
  const [open, close] = limits.visibility.isShown ? limitsConfig.shownMarks : ['', '']
  const textOf = (reading: Reading) => `${open}${reading.lead}${reading.value}${close}`
  const shown = readingOf(display.format)
  const alternate = display.hover ? readingOf(display.hover) : null
  const room = Math.max(textOf(shown).length, alternate ? textOf(alternate).length : 0)
  const left = Math.floor((room - textOf(shown).length) / 2)
  const color = isVoid ? 'inactive' : levelColor(limit.percentUsed, limits.config.thresholds)

  return {
    id: window,
    isPressable: true,
    label: (
      <Text>
        {' '.repeat(left)}
        <Text color={color}>{open}</Text>
        <Text dimColor>{shown.lead}</Text>
        <Text color={color}>{`${shown.value}${close}`.padEnd(room - left - open.length - shown.lead.length)}</Text>
      </Text>
    ),
    overlay: alternate && (
      <Text inverse color={color}>
        {center(textOf(alternate), room)}
      </Text>
    ),
  }
}

export const registerLimits = (on: On, limits: Limits, isOn: () => boolean) => {
  registerLimitsPane(on, limits, isOn)
}
