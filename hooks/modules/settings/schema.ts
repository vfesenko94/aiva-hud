import type { CacheDisplay, CacheFormat, ContextFormat, Display, HintKey, LimitFormat, ModelFormat } from '../../core'
import { settingsConfig } from './config'

export type Part = keyof typeof settingsConfig.defaults.activity

export type Displays = { model: Display<ModelFormat>; context: Display<ContextFormat>; fiveHour: Display<LimitFormat>; sevenDay: Display<LimitFormat>; cache: CacheDisplay }

export type Shown = keyof Displays

export type Section = keyof typeof settingsConfig.sections

export type SettingsValue = { activity: Record<Part, boolean>; display: Displays; hints: Record<HintKey, boolean> }

const { defaults, displays, modules } = settingsConfig

const locked: ReadonlySet<string> = new Set(modules.filter(module => module.isLocked).map(module => module.key))

const fieldOf = (value: unknown, key: string): unknown => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined)

const flagsOf = <K extends string>(value: unknown, fallback: Record<K, boolean>) =>
  Object.fromEntries((Object.keys(fallback) as K[]).map(key => {
    const field = fieldOf(value, key)
    return [key, typeof field === 'boolean' ? field : fallback[key]]
  })) as Record<K, boolean>

const displayOf = <F extends string>(value: unknown, key: Shown, fallback: Display<F>): Display<F> => {
  const { hasHover, formats } = displays[key]
  const isFormat = (one: unknown): one is F => typeof one === 'string' && Object.keys(formats).includes(one)
  const format = fieldOf(value, 'format')
  const hover = fieldOf(value, 'hover')
  const shown = isFormat(format) ? format : fallback.format
  const alternate = !hasHover ? null : hover === null || isFormat(hover) ? hover : fallback.hover
  return { format: shown, hover: alternate === shown ? null : alternate }
}

const legacyWindows = (value: unknown) => {
  const limits = fieldOf(value, 'limits')
  const isOn = fieldOf(fieldOf(value, 'activity'), 'limits') !== false
  if (!isOn) return { fiveHour: false, sevenDay: false }
  const windowOf = (key: 'fiveHour' | 'sevenDay') => {
    const field = fieldOf(limits, key)
    return typeof field === 'boolean' ? { [key]: field } : {}
  }
  return { ...windowOf('fiveHour'), ...windowOf('sevenDay') }
}

const legacyLimit = (value: unknown): Display<LimitFormat> | null =>
  fieldOf(fieldOf(value, 'limits'), 'resetTime') === true ? { format: 'countdown', hover: 'labeled' } : null

export const parseSettings = (value: unknown): SettingsValue => {
  const activity = flagsOf(fieldOf(value, 'activity'), { ...defaults.activity, ...legacyWindows(value) })
  const display = fieldOf(value, 'display')
  const limitOf = (key: 'fiveHour' | 'sevenDay') => displayOf<LimitFormat>(fieldOf(display, key), key, legacyLimit(value) ?? defaults.display[key])
  return {
    activity: Object.fromEntries(Object.entries(activity).map(([key, isOn]) => [key, isOn && !locked.has(key)])) as Record<Part, boolean>,
    display: {
      model: displayOf<ModelFormat>(fieldOf(display, 'model'), 'model', defaults.display.model),
      context: displayOf<ContextFormat>(fieldOf(display, 'context'), 'context', defaults.display.context),
      fiveHour: limitOf('fiveHour'),
      sevenDay: limitOf('sevenDay'),
      cache: { ...displayOf<CacheFormat>(fieldOf(display, 'cache'), 'cache', defaults.display.cache), until: flagsOf(fieldOf(display, 'cache'), { until: defaults.display.cache.until }).until },
    },
    hints: flagsOf(fieldOf(value, 'hints'), defaults.hints),
  }
}

export const defaultSettings = (): SettingsValue => parseSettings(undefined)
