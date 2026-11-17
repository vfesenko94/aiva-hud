import type { EngineInterface, On, PromptComposeResult } from 'claude-code'

import { hiddenPane } from '../../core'
import type { Block, Live, ModelFormat, PaneState, Panes, Ui } from '../../core'
import { effortColors } from './config'
import { freshEffortWatch, readEffort, registerEffortCommand, watchEffort } from './effort'
import type { EffortWatch } from './effort'
import { displayName, familyName, familyOf, latestIdsIn, modelColorOf, rememberIds } from './data'
import { registerPicker } from './pane'
import type { Draft } from './picker'

export { pickerConfig } from './config'
export { forgetEffort, recordEffort } from './effort'
export { closePicker, isPickerShown, notePicker, releaseEfforts, releaseModels, showEfforts, showModels } from './pane'

type ModelParts = { model: () => boolean; effort: () => boolean }

export type Model = { readonly parts: ModelParts; readonly panes: Panes; readonly live: Readonly<Live>; visibility: PaneState; runtime: Draft | null; latestIds: string; effortWatch: EffortWatch }

export const createModel = (parts: ModelParts, panes: Panes, live: Readonly<Live>): Model => ({ parts, panes, live, visibility: hiddenPane(), runtime: null, latestIds: '', effortWatch: freshEffortWatch() })

export const releaseEffortWatch = (model: Model) => {
  model.effortWatch = freshEffortWatch()
}

export async function modelBlock($: EngineInterface, { Text }: Ui, format: ModelFormat): Promise<Block> {
  const id = await $.session.model()
  return { id: 'model', isPressable: true, label: <Text color={modelColorOf(familyOf(id))}>{format === 'family' ? familyName(id) : displayName(id)}</Text> }
}

export async function effortBlock($: EngineInterface, model: Model, { Text }: Ui): Promise<Block | null> {
  await watchEffort($, model.effortWatch)
  const effort = await readEffort($)
  if (effort === null) return null

  return { id: 'effort', isPressable: true, gap: <Text> </Text>, label: <Text color={effortColors.levels[effort] ?? effortColors.fallback}>{effort}</Text> }
}

export async function notePickerPrompt($: EngineInterface, model: Model, composed: PromptComposeResult) {
  const ids = latestIdsIn(composed)
  const seen = ids.join(' ')
  if (ids.length === 0 || seen === model.latestIds) return
  model.latestIds = seen
  await rememberIds($, ids, true).catch(() => {
    model.latestIds = ''
  })
}

export const registerModel = (on: On, model: Model) => {
  registerPicker(on, model)
  registerEffortCommand(on, model.parts.effort)
}
