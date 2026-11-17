import type { EngineInterface, SessionRateLimit } from 'claude-code'

import { configFolder } from '../../core'

import { limitsConfig } from './config'

type Reading = { seenAt: number; rateLimits: SessionRateLimit[] }

export type Tracking = { seenAt: number | null; reading: Reading | null; path: string | null | undefined; readAt: number | null }

export const freshTracking = (): Tracking => ({ seenAt: null, reading: null, path: undefined, readAt: null })

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isLimit = (value: unknown): value is SessionRateLimit =>
  isRecord(value) && typeof value.kind === 'string' &&
  typeof value.percentUsed === 'number' && Number.isFinite(value.percentUsed) && value.percentUsed >= 0 &&
  (value.resetsAt === undefined || (typeof value.resetsAt === 'string' && Number.isFinite(Date.parse(value.resetsAt))))

function parseReading(text: string): Reading | null {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) && typeof value.seenAt === 'number' && Number.isFinite(value.seenAt) && value.seenAt >= 0 &&
      Array.isArray(value.rateLimits) && value.rateLimits.length > 0 && value.rateLimits.every(isLimit)
      ? { seenAt: value.seenAt, rateLimits: value.rateLimits } : null
  } catch {
    return null
  }
}

async function pathOf($: EngineInterface, tracking: Tracking) {
  if (tracking.path !== undefined) return tracking.path
  const folder = await configFolder($)
  tracking.path = folder ? `${folder}/${limitsConfig.file}` : null
  return tracking.path
}

async function readShared($: EngineInterface, tracking: Tracking) {
  const path = await pathOf($, tracking)
  return path ? $.fs.read(path).then(parseReading, () => null) : null
}

const adopt = (tracking: Tracking, reading: Reading | null) => {
  if (reading && (!tracking.reading || reading.seenAt > tracking.reading.seenAt)) {
    tracking.reading = reading
    tracking.seenAt = reading.seenAt
  }
}

async function writeShared($: EngineInterface, tracking: Tracking, isCurrent: () => boolean) {
  const path = await pathOf($, tracking)
  const shared = await readShared($, tracking).catch(() => null)
  if (!isCurrent()) return
  adopt(tracking, shared)
  if (path && tracking.reading && (!shared || tracking.reading.seenAt > shared.seenAt)) {
    await $.fs.write(path, JSON.stringify(tracking.reading)).catch(() => undefined)
  }
}

export async function shareReading($: EngineInterface, tracking: Tracking, reading: Reading, isCurrent: () => boolean) {
  const shared = await readShared($, tracking).catch(() => null)
  if (!isCurrent()) return
  adopt(tracking, shared)
  adopt(tracking, reading)
  if (!shared || (tracking.reading && tracking.reading.seenAt > shared.seenAt)) await writeShared($, tracking, isCurrent)
}

export async function refreshReading($: EngineInterface, tracking: Tracking, isCurrent: () => boolean) {
  const now = await $.clock.now()
  if (tracking.readAt !== null && now >= tracking.readAt && now - tracking.readAt < limitsConfig.readMs) return
  tracking.readAt = now
  const shared = await readShared($, tracking).catch(() => null)
  if (!isCurrent()) return
  adopt(tracking, shared)
  if (tracking.reading && (!shared || tracking.reading.seenAt > shared.seenAt)) await writeShared($, tracking, isCurrent)
}
