import type { EngineInterface, On, RenderInput, UiPane } from 'claude-code'

import { closePaneState, createMoveGuard, cycleStep, focusElement, hidePaneState, notePaneState, registerPaneClose, registerPanePress, scrollIntent, shownFrame, stepOf } from '../../core'
import type { Step } from '../../core'
import { pickerConfig } from './config'
import { loadEfforts, loadModels, setEffort, switchModel } from './data'
import type { Efforts, Models } from './data'
import type { Model } from './index'
import { changesOf, draftEffort, draftModel, EFFORT, effortOptions, errorText, failureView, freshDraft, hasEffort, MODEL, modelOptions, pickerView } from './picker'
import type { Draft } from './picker'

const isOn = (model: Model) => model.parts.model() || model.parts.effort()

const release = (model: Model) => {
  hidePaneState(model.visibility)
  model.runtime = null
}

export const isPickerShown = (model: Model) => model.visibility.isShown

export const releaseModels = (model: Model) => {
  if (!model.runtime) return
  model.runtime.models = null
  model.runtime.model = null
}

export const releaseEfforts = (model: Model) => {
  if (!model.runtime) return
  model.runtime.efforts = null
  model.runtime.effort = null
}

export function closePicker($: EngineInterface, model: Model) {
  model.runtime = null
  return closePaneState($, pickerConfig, model.visibility)
}

export function notePicker(model: Model, panes: readonly UiPane[]) {
  notePaneState(model.visibility, panes, pickerConfig.id)
  if (!model.visibility.isShown) model.runtime = null
}

function modelsOf($: EngineInterface, run: Draft) {
  return (run.models ??= loadModels($))
}

function effortsOf($: EngineInterface, run: Draft) {
  return (run.efforts ??= loadEfforts($))
}

async function moveFocus($: EngineInterface, model: Model, by: number) {
  const run = model.runtime
  if (!run || run.applying) return
  const at = run.stops.indexOf(run.selected)
  const key = run.stops[Math.max(0, Math.min(run.stops.length - 1, at + by))]
  if (key === undefined || key === run.selected) return
  run.selected = key
  $.ui.invalidate('ui.render')
  await focusElement($, pickerConfig.id, key)
}

async function stepDraft($: EngineInterface, model: Model, step: Step) {
  const run = model.runtime
  if (!run || run.applying) return
  if (run.selected === MODEL && model.parts.model()) {
    const pending = modelsOf($, run)
    const models = await pending
    if (model.runtime !== run || run.models !== pending) return
    run.model = cycleStep({ options: modelOptions(models), value: draftModel(run, models) }, step)
  } else if (run.selected === EFFORT && model.parts.effort()) {
    const pending = effortsOf($, run)
    const efforts = await pending
    if (model.runtime !== run || run.efforts !== pending || !hasEffort(efforts)) return
    run.effort = cycleStep({ options: effortOptions(efforts), value: draftEffort(run, efforts), wrap: false }, step)
  } else return
  run.error = null
  $.ui.invalidate('ui.render')
}

async function runCommand($: EngineInterface, model: Model, command: string, failure: string) {
  if (model.visibility.isShown) await closePicker($, model)
  void $.command.run({ command }).catch(error => {
    $.ui.toast(`${failure}${error instanceof Error ? error.message : error}`)
  })
}

export function showModels($: EngineInterface, model: Model) {
  return runCommand($, model, pickerConfig.modelCommand, pickerConfig.allModelsFailed)
}

export function showEfforts($: EngineInterface, model: Model) {
  return runCommand($, model, pickerConfig.effortCommand, pickerConfig.effortsFailed)
}

async function apply($: EngineInterface, model: Model) {
  const run = model.runtime
  if (!run || run.applying || model.live.isWorking) return
  run.applying = true
  run.error = null
  $.ui.invalidate('ui.render')
  try {
    const pendingModels = model.parts.model() ? modelsOf($, run) : null
    const pendingEfforts = model.parts.effort() ? effortsOf($, run) : null
    const [models, efforts] = await Promise.all([pendingModels, pendingEfforts])
    const isModelCurrent = () => model.runtime === run && run.models === pendingModels
    const isEffortCurrent = () => model.runtime === run && run.efforts === pendingEfforts
    if (!isModelCurrent() || !isEffortCurrent()) return
    const changes = changesOf(run, models, efforts)
    if (models && changes.model) {
      if (!(await switchModel($, models, changes.model, isModelCurrent))) return
      run.model = null
    }
    if (efforts && changes.effort && isEffortCurrent()) {
      await setEffort($, efforts, changes.effort, isEffortCurrent)
      run.effort = null
    }
    if (model.runtime === run) await closePicker($, model)
  } catch (error) {
    if (model.runtime === run) run.error = errorText(error)
  } finally {
    run.applying = false
    if (model.runtime === run) $.ui.invalidate('ui.render')
  }
}

async function renderPicker($: EngineInterface, model: Model, e: RenderInput<'Pane'>) {
  const { Box } = $.ui.resolve(e)
  const pane = await shownFrame($, e, model.panes, pickerConfig, model.visibility)
  if (!pane) {
    model.runtime = null
    return <Box />
  }
  const run = model.runtime ??= freshDraft()
  const width = e.props.bodyColumns
  const pendingModels = model.parts.model() ? modelsOf($, run) : null
  const pendingEfforts = model.parts.effort() ? effortsOf($, run) : null
  let models: Models | null
  let efforts: Efforts | null
  try {
    models = pendingModels && (await pendingModels)
    efforts = pendingEfforts && (await pendingEfforts)
  } catch (error) {
    if (model.runtime !== run) return <Box />
    if (run.models === pendingModels) run.models = null
    if (run.efforts === pendingEfforts) run.efforts = null
    return pane.frame(failureView(pane.ui, error, width, () => void closePicker($, model)))
  }
  if (model.runtime !== run || run.models !== pendingModels || run.efforts !== pendingEfforts) return <Box />
  return pane.frame(pickerView(pane.ui, {
    run,
    models,
    efforts,
    isWorking: model.live.isWorking,
    width,
    rows: pane.rows,
    redraw: () => $.ui.invalidate('ui.render'),
    apply: () => void apply($, model),
    showAll: () => void showModels($, model),
  }))
}

export const registerPicker = (on: On, model: Model) => {
  const { id } = pickerConfig
  const guard = createMoveGuard()

  registerPanePress(on, model.panes, pickerConfig, () => isOn(model))

  registerPaneClose(on, model.panes, pickerConfig, { isOn: () => isOn(model), back: () => null, closed: () => release(model) })

  on('ui.focus', { requestId: id }, async ($, e, next) => {
    const run = model.runtime
    if (!isOn(model) || !run || !e.element || !run.stops.includes(e.element)) return next(e)
    const moved = await next(e)
    if (model.runtime === run && !moved.deny) {
      run.selected = e.element
      $.ui.invalidate('ui.render')
    }
    return moved
  })

  on('ui.scroll', { requestId: id }, async ($, e, next) => {
    if (!isOn(model) || e.origin.kind !== 'person') return next(e)
    const direction = scrollIntent(e)
    const step = direction && stepOf(direction)
    if (step) await guard(() => stepDraft($, model, step))
    else if (direction) await guard(() => moveFocus($, model, direction === 'up' ? -1 : 1))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: id }, ($, e, next) => (isOn(model) ? renderPicker($, model, e) : next(e)))
}
