import type { EngineInterface } from 'claude-code'

import { forgetCache, releaseCache } from './modules/cache'
import type { Cache } from './modules/cache'
import { activateContext, closeContext, isContextShown, releaseContext, showContext } from './modules/context'
import type { Context } from './modules/context'
import { activateLimits, closeLimits, isLimitsShown, resetLimits, showLimits } from './modules/limits'
import type { Limits } from './modules/limits'
import { closePicker, forgetEffort, isPickerShown, releaseEffortWatch, releaseEfforts, releaseModels, showEfforts, showModels } from './modules/model'
import type { Model } from './modules/model'
import { activateSettings, closeSettings, flipSetting, isActive, isSettingsShown, saveSettings, showSettings } from './modules/settings'
import type { Part, Settings } from './modules/settings'
import { releaseShells } from './modules/shells'
import type { Shells } from './modules/shells'
import type { StripActions } from './modules/strip'

type Targets = {
  readonly settings: Settings
  readonly context: Context
  readonly model: Model
  readonly limits: Limits
  readonly cache: Cache
  readonly shells: Shells
}

const opensModels = ({ settings }: Targets, id: string) => id === 'model' && isActive(settings, 'model')

const opensEfforts = ({ settings }: Targets, id: string) => id === 'effort' && isActive(settings, 'effort')

const opensContext = ({ settings }: Targets, id: string) => id === 'context' && isActive(settings, 'context')

const isLimitsOff = ({ settings }: Targets) => !isActive(settings, 'fiveHour') && !isActive(settings, 'sevenDay')

const opensLimits = ({ settings }: Targets, id: string) => (id === 'fiveHour' || id === 'sevenDay') && isActive(settings, id)

function pressBlock($: EngineInterface, targets: Targets, id: string) {
  if (id === 'settings') return activateSettings($, targets.settings)
  if (opensModels(targets, id)) return showModels($, targets.model)
  if (opensEfforts(targets, id)) return showEfforts($, targets.model)
  if (opensContext(targets, id)) return activateContext($, targets.context)
  if (opensLimits(targets, id)) return activateLimits($, targets.limits)
}

function pressInBox($: EngineInterface, targets: Targets, id: string) {
  const { context, model, limits, settings } = targets
  if (id === 'settings') return isSettingsShown(settings) ? closeSettings($, settings) : showSettings($, settings)
  if (opensModels(targets, id)) return showModels($, model)
  if (opensEfforts(targets, id)) return showEfforts($, model)
  if (opensContext(targets, id)) return isContextShown(context) ? closeContext($, context) : showContext($, context)
  if (opensLimits(targets, id)) return isLimitsShown(limits) ? closeLimits($, limits) : showLimits($, limits)
}

function openBlock($: EngineInterface, targets: Targets, id: string) {
  if (id === 'settings') return showSettings($, targets.settings)
  if (opensContext(targets, id)) return showContext($, targets.context)
  if (opensLimits(targets, id)) return showLimits($, targets.limits)
}

export function stripActions($: EngineInterface, targets: Targets): StripActions {
  return {
    submitsOnEnter: id =>
      (id === 'settings' && !isSettingsShown(targets.settings)) ||
      (id === 'context' && !isContextShown(targets.context)) ||
      (opensLimits(targets, id) && !isLimitsShown(targets.limits)),
    press: id => void pressBlock($, targets, id),
    pressInBox: id => void pressInBox($, targets, id),
    open: id => void openBlock($, targets, id),
  }
}

function releasePart(targets: Targets, part: Part) {
  const { context, model, limits, cache, shells } = targets
  if (part === 'context') releaseContext(context)
  if (part === 'model') releaseModels(model)
  if (part === 'model' || part === 'effort') releaseEfforts(model)
  if (part === 'model' || part === 'effort') releaseEffortWatch(model)
  if (part === 'cache') releaseCache(cache)
  if (part === 'shells') releaseShells(shells)
  if ((part === 'fiveHour' || part === 'sevenDay') && isLimitsOff(targets)) resetLimits(limits)
}

async function cleanPart($: EngineInterface, targets: Targets, part: Part) {
  const { settings, context, model, limits } = targets
  const isOff = (one: Part) => () => !isActive(settings, one)
  if (part === 'context' && isOff('context')() && isContextShown(context)) await closeContext($, context)
  if (part === 'cache') await forgetCache($, isOff('cache'))
  if (part === 'model' || part === 'effort') await forgetEffort($, isOff('effort'))
  if ((part === 'model' || part === 'effort') && isOff('model')() && isOff('effort')() && isPickerShown(model)) await closePicker($, model)
  if ((part === 'fiveHour' || part === 'sevenDay') && isLimitsOff(targets) && isLimitsShown(limits)) await closeLimits($, limits)
}

export async function toggleActivity($: EngineInterface, targets: Targets, part: Part) {
  const isOn = flipSetting($, targets.settings, part)
  if (!isOn) releasePart(targets, part)
  await saveSettings($, targets.settings)
  if (!isOn) await cleanPart($, targets, part)
}
