import type { EngineInterface } from 'claude-code'

import { createWriter, hiddenPane } from '../../core'
import type { Cell, HintKey, PaneState, Panes, Writer } from '../../core'
import { settingsConfig } from './config'
import { defaultSettings, parseSettings } from './schema'
import type { Part, Section, SettingsValue, Shown } from './schema'
import { createStar, loadStar } from './star'
import type { Star } from './star'
import { createKeysDraft } from './keys'
import type { KeysDraft } from './keys'

export type Settings = { readonly panes: Panes; readonly write: Writer<SettingsValue>; readonly star: Star; readonly keys: KeysDraft; value: SettingsValue; section: Section | null; module: Part; selected: string; first: number; visibility: PaneState; isResetting: boolean; navigation: Cell[]; generation: number }

export const createSettings = (panes: Panes): Settings => ({ panes, write: createWriter<SettingsValue>(), star: createStar(), keys: createKeysDraft(), value: defaultSettings(), section: null, module: 'model', selected: '', first: 0, visibility: hiddenPane(), isResetting: false, navigation: [], generation: 0 })

export const isActive = (settings: Settings, part: Part) => settings.value.activity[part] && (part !== 'effort' || settings.value.activity.model)

export const displayOf = <K extends Shown>(settings: Settings, key: K) => settings.value.display[key]

export const isHintShown = (settings: Settings, key: HintKey) => settings.value.hints[key]

export function flipSetting($: EngineInterface, settings: Settings, part: Part) {
  const activity = { ...settings.value.activity, [part]: !settings.value.activity[part] }
  settings.value = { ...settings.value, activity }
  $.ui.invalidate('ui.render')

  return activity[part]
}

export async function loadSettings($: EngineInterface, settings: Settings) {
  settings.value = parseSettings(await $.store.get(settingsConfig.storeKey).catch(() => undefined))
  await loadStar($, settings.star)
}

export function saveSettings($: EngineInterface, settings: Settings) {
  return settings.write(settingsConfig.storeKey, settings.value, (key, value) =>
    $.store.set(key, value).catch(error => {
      $.ui.toast(`Settings could not be saved: ${error instanceof Error ? error.message : error}`)
    }),
  )
}
