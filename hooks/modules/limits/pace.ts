import type { SessionRateLimit } from 'claude-code'

import { limitsConfig } from './config'

export type Budget =
  | { kind: 'reset' }
  | { kind: 'reached' }
  | { kind: 'early'; from: number }
  | { kind: 'forecast'; percent: number; isOver: boolean }
  | { kind: 'left'; left: number; perDay: number }

type Spec = (typeof limitsConfig.windows)[keyof typeof limitsConfig.windows]

export const resetOf = (limit: SessionRateLimit) => {
  const at = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
  return Number.isFinite(at) ? at : null
}

const roundPercent = (value: number) => Math.round(value * 10) / 10

const forecastOf = (used: number, spec: Spec, resetAt: number, at: number): Budget => {
  const start = resetAt - spec.span
  const from = start + spec.span * limitsConfig.minShare
  if (at < from) return { kind: 'early', from }
  const projected = (used * spec.span) / (at - start)
  if (projected >= 100) return { kind: 'forecast', percent: 100, isOver: true }
  const step = limitsConfig.forecastStep
  return { kind: 'forecast', percent: Math.max(Math.ceil(used), Math.round(projected / step) * step), isOver: false }
}

export const budgetOf = (limit: SessionRateLimit, spec: Spec, now: number, seenAt: number | null): Budget | null => {
  const resetAt = resetOf(limit)
  if (resetAt === null) return null
  if (now >= resetAt) return { kind: 'reset' }
  if (limit.percentUsed >= 100) return { kind: 'reached' }
  const used = Math.max(0, limit.percentUsed)
  if (spec.note === 'forecast') return forecastOf(used, spec, resetAt, seenAt ?? now)
  const left = roundPercent(100 - used)
  return { kind: 'left', left, perDay: left / Math.max(1, Math.ceil((resetAt - now) / limitsConfig.day)) }
}
