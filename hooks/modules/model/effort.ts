import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Effort } from '../../../types'
import { pickerConfig } from './config'

const effort = atom({ plugin: 'aiva-hud', key: 'effort' } as const, null)

export async function recordEffort($: EngineInterface, value: Effort | null) {
  await update($, effort, () => value)
}

export async function readEffort($: EngineInterface) {
  const observed = await read($, effort)
  if (observed !== null) return `${observed}`
  const setting = await $.settings.read({ key: 'effortLevel' })

  return typeof setting === 'string' || typeof setting === 'number' ? `${setting}` : null
}

export async function forgetEffort($: EngineInterface, isOff: () => boolean) {
  await update($, effort, value => (isOff() ? null : value))
}

const levelOf = (value: unknown) => pickerConfig.levels.find(level => level === `${value}`.trim().toLowerCase()) ?? null

async function engineEffort($: EngineInterface) {
  const row = (await $.config.list()).find(one => one.provider.plugin === 'engine' && one.key === pickerConfig.effortKey)
  return levelOf(row?.value)
}

export type EffortWatch = { value: string | null; readAt: number | null }

export const freshEffortWatch = (): EffortWatch => ({ value: null, readAt: null })

export async function watchEffort($: EngineInterface, watch: EffortWatch) {
  const now = await $.clock.now()
  if (watch.readAt !== null && now >= watch.readAt && now - watch.readAt < pickerConfig.effortReadMs) return
  watch.readAt = now
  const value = await engineEffort($).catch(() => null)
  if (value === null || value === watch.value) return
  watch.value = value
  await recordEffort($, value)
}

export const registerEffortCommand = (on: On, isOn: () => boolean) => {
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    if (!isOn()) return next(e)

    const result = await next(e)
    if (!isOn()) return result
    const typed = pickerConfig.failure.test(result.text ?? '') ? null : levelOf(e.args)
    await recordEffort($, typed ?? (await engineEffort($).catch(() => null)))
    $.ui.invalidate('ui.render')

    return result
  })
}
