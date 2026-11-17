import type { EngineInterface, On } from 'claude-code'

import type { Block, Ui } from '../../core'
import { settingsConfig } from './config'
import { registerSettingsPane, showSettings } from './pane'
import type { Settings } from './store'

export { settingsConfig } from './config'
export type { Part } from './schema'
export { activateSettings, closeSettings, isSettingsShown, noteSettings, renderSettings, showSettings } from './pane'
export { createSettings, displayOf, flipSetting, isActive, isHintShown, loadSettings, saveSettings } from './store'
export type { Settings } from './store'

export const settingsBlock = ({ Text }: Ui): Block => ({
  id: 'settings',
  isPressable: true,
  label: <Text dimColor>{settingsConfig.block}</Text>,
})

export async function registerSettingsCommand($: EngineInterface) {
  const { description, argumentHint } = settingsConfig
  await $.command.register({ name: 'aiva-hud', description, argumentHint, immediate: true }).catch(() => undefined)
}

export const registerSettings = (on: On, settings: Settings) => {
  const { commandArgs, commandUsage } = settingsConfig

  registerSettingsPane(on, settings)

  on('command.run', { command: 'aiva-hud' }, async ($, e) => {
    if (!commandArgs.includes(e.args.trim())) return { text: commandUsage }
    await showSettings($, settings)
    return {}
  })
}
