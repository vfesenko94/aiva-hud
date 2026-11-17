import type { Register, Timer } from 'claude-code'

import { stripActions, toggleActivity } from './actions'
import { completeLiveTurn, createKeys, createLive, createPanes, loadKeys, resetLive, resolveConfig, startLiveTurn } from './core'
import type { Block } from './core'
import { cacheScope, createCache, endCacheSession, noteModelSwitch, recordResponse, registerCache, stopWarm } from './modules/cache'
import { beginContextStep, compactContext, completeContextTurn, contextBlock, contextScope, createContext, endContextSession, noteContextSubmit, noteContextTool, recordContextStep, registerContext, startContextSession, startContextTurn, trackContextTool } from './modules/context'
import { createLimits, limitBlock, limitsUsage, noteLimits, noteLimitsReading, registerLimits, resetLimits } from './modules/limits'
import { createModel, effortBlock, modelBlock, notePicker, notePickerPrompt, recordEffort, registerModel } from './modules/model'
import { createSettings, displayOf, isActive, isHintShown, loadSettings, noteSettings, registerSettings, registerSettingsCommand, renderSettings, settingsBlock, settingsConfig } from './modules/settings'
import { createShells, registerShells, shellsBlock } from './modules/shells'
import { changeNav, createStrip, editNav, registerStrip, renderStrip, submitNav } from './modules/strip'

export const register: Register = (on, options) => {
  const config = resolveConfig(options)
  const keys = createKeys()
  const panes = createPanes(keys)
  const live = createLive()
  const settings = createSettings(panes)
  const isModelOn = () => isActive(settings, 'model')
  const isEffortOn = () => isActive(settings, 'effort')
  const isContextOn = () => isActive(settings, 'context')
  const isFiveHourOn = () => isActive(settings, 'fiveHour')
  const isSevenDayOn = () => isActive(settings, 'sevenDay')
  const isCacheOn = () => isActive(settings, 'cache')
  const isShellsOn = () => isActive(settings, 'shells')
  const isLimitsOn = () => isFiveHourOn() || isSevenDayOn()
  const context = createContext(config, panes, live)
  const model = createModel({ model: isModelOn, effort: isEffortOn }, panes, live)
  const limits = createLimits(config, panes)
  const cache = createCache(config.cache.ttl)
  const shells = createShells()
  const strip = createStrip()
  const targets = { settings, context, model, limits, cache, shells }
  const runtime = { tick: null as Timer | null }
  registerSettings(on, settings)
  registerContext(on, context, isContextOn)
  registerModel(on, model)
  registerLimits(on, limits, isLimitsOn)
  registerCache(on, cache, keys, isCacheOn, () => displayOf(settings, 'cache'))
  registerShells(on, shells, isShellsOn)
  registerStrip(on, key => isHintShown(settings, key))

  on('session.start', async ($, e, next) => {
    resetLive($, live)
    resetLimits(limits)
    runtime.tick?.cancel()
    runtime.tick = $.clock.every(config.timing.stripTickMs, () => $.ui.invalidate('ui.render'))
    await loadSettings($, settings)
    await loadKeys($, keys).catch(() => undefined)
    await registerSettingsCommand($)
    if (isContextOn()) await startContextSession($, context)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    resetLive($, live)
    resetLimits(limits)
    if (isCacheOn()) endCacheSession(cache, e)
    if (isContextOn()) await endContextSession($, context, e)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    startLiveTurn($, live, e)
    if (!e.agentId) stopWarm($, cache)
    if (isContextOn()) await startContextTurn($, context, e)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    completeLiveTurn($, live, e)
    if (isContextOn()) await completeContextTurn($, context, e)

    return next(e)
  })

  on('tool.call', ($, e, next) => (isContextOn() ? trackContextTool($, context, e, next) : next(e)))

  on('tool.describe', async (_, e, next) => {
    const isCurrent = contextScope(context)
    const described = await next(e)
    if (isContextOn() && isCurrent()) noteContextTool(context, e, described)

    return described
  })

  on('session.compact', ($, e, next) => (isContextOn() ? compactContext($, context, e, next) : next(e)))

  on('classic.PostModelSwitch', ($, e, next) => {
    if (isCacheOn()) noteModelSwitch($, cache, e.cache_ttl)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (submitNav($, strip, e, stripActions($, targets))) return { text: e.text }
    if (isContextOn()) noteContextSubmit(context, e)

    return next(e)
  })

  on('prompt.edit', ($, e, next) => editNav($, strip, e, next, stripActions($, targets)))

  on('prompt.change', async ($, e, next) => {
    await changeNav($, strip, e, stripActions($, targets))

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (isModelOn()) await notePickerPrompt($, model, composed)

    return composed
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (isLimitsOn() && e.changed.includes('rateLimits')) await noteLimitsReading($, limits, e.rateLimits)

    return result
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)

    const recordsCache = isCacheOn()
    const recordsContext = isContextOn()
    const recordsLimits = isLimitsOn()
    const isCacheCurrent = cacheScope(cache)
    const isContextCurrent = contextScope(context)
    if (isEffortOn()) await recordEffort($, e.effort ?? null)
    if (recordsContext) await beginContextStep($, context, e)
    const result = yield* next(e)
    if (result.usage && recordsLimits && isLimitsOn()) await noteLimitsReading($, limits)
    if (result.usage && recordsCache && isCacheCurrent()) await recordResponse($, result.usage, isCacheCurrent)
    if (result.usage && recordsContext && isContextCurrent()) await recordContextStep($, context, e, result.usage, result.answer)

    return result
  })

  on('ui.render', { component: 'Pane', requestId: settingsConfig.id }, ($, e) => renderSettings($, settings, e, part => void toggleActivity($, targets, part)))

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const modes = e.props.modes.length > 0 ? await next(e) : null
    const ui = $.ui.resolve(e)
    const usage = isContextOn() || isFiveHourOn() || isSevenDayOn() ? await $.session.usage() : null
    const sharedUsage = usage && isLimitsOn() ? await limitsUsage($, limits, usage) : null
    const panes = await $.ui.panes()
    noteSettings(settings, panes)
    if (isModelOn() || isEffortOn()) notePicker(model, panes)
    if (isLimitsOn()) noteLimits(limits, panes)
    const blocks = [
      isModelOn() ? await modelBlock($, ui, displayOf(settings, 'model').format) : null,
      isEffortOn() ? await effortBlock($, model, ui) : null,
      usage && isContextOn() ? await contextBlock($, context, ui, usage, displayOf(settings, 'context'), panes) : null,
      sharedUsage && isFiveHourOn() ? await limitBlock($, limits, ui, sharedUsage, 'fiveHour', displayOf(settings, 'fiveHour')) : null,
      sharedUsage && isSevenDayOn() ? await limitBlock($, limits, ui, sharedUsage, 'sevenDay', displayOf(settings, 'sevenDay')) : null,
      isShellsOn() ? shellsBlock(shells, ui) : null,
      isActive(settings, 'settings') ? settingsBlock(ui) : null,
    ].filter((block): block is Block => block !== null)

    return renderStrip($, strip, ui, blocks, modes, stripActions($, targets))
  })
}
