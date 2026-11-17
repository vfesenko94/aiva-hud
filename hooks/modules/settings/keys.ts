import type { EngineInterface } from 'claude-code'

import { boundChord, keyConfig, keyIds, keysPath, offeredChords, readKeys, saveKeys, takenBy } from '../../core'
import type { CycleOption, KeyChange, KeyId, Keys, KeysFile } from '../../core'
import { settingsConfig } from './config'

export type KeysDraft = { file: KeysFile | null; path: string | null; drafts: Partial<Record<KeyId, string>>; status: { text: string; isError: boolean } | null; isSaving: boolean; generation: number }

export const createKeysDraft = (): KeysDraft => ({ file: null, path: null, drafts: {}, status: null, isSaving: false, generation: 0 })

const { texts } = settingsConfig.keys

export const currentChord = (draft: KeysDraft, id: KeyId) => (draft.file ? boundChord(draft.file, id) : null) ?? ''

export const draftChord = (draft: KeysDraft, id: KeyId) => draft.drafts[id] ?? currentChord(draft, id)

export const keyOptions = (draft: KeysDraft, keys: Readonly<Keys>, id: KeyId): CycleOption[] => {
  const { fallback } = keyConfig.keys[id]
  const options = offeredChords(keys, id)
  const current = currentChord(draft, id)
  const chords = [...(current && !options.includes(current) ? [current] : []), ...options]
  return [...chords.map(chord => ({ value: chord, label: chord })), { value: '', label: fallback ? `${fallback} ${texts.engineDefault}` : texts.none }]
}

export const keyChanges = (draft: KeysDraft): KeyChange[] =>
  keyIds.filter(id => draft.drafts[id] !== undefined && draft.drafts[id] !== currentChord(draft, id)).map(id => ({ id, chord: draft.drafts[id] || null }))

export const keyTaken = (draft: KeysDraft, id: KeyId) => {
  if (!draft.file) return null
  const changes = keyChanges(draft)
  const chord = draftChord(draft, id)
  return takenBy(draft.file, changes.some(change => change.id === id) ? changes : [...changes, { id, chord: chord || null }], { id, chord: chord || null })
}

export const keyNote = (draft: KeysDraft, id: KeyId) => {
  const taken = keyTaken(draft, id)
  if (taken) return { text: `${texts.taken}${taken}`, color: 'error' as const }
  const current = currentChord(draft, id)
  const chosen = draftChord(draft, id)
  if (chosen !== current) return { text: `${texts.was}${current || (keyConfig.keys[id].fallback ? texts.engineDefault : texts.none)}` }
  return { text: current ? texts.bound : keyConfig.keys[id].fallback ? texts.engineDefault : texts.unbound, ...(current ? { color: 'success' as const } : {}) }
}

export const isKeysSavable = (draft: KeysDraft) =>
  draft.file !== null && draft.file.kind !== 'broken' && !draft.isSaving && keyChanges(draft).length > 0 && keyIds.every(id => !keyTaken(draft, id))

export async function openKeys($: EngineInterface, draft: KeysDraft) {
  const generation = ++draft.generation
  Object.assign(draft, { file: null, drafts: {}, status: null, isSaving: false })
  const path = await keysPath($)
  const file = await readKeys($)
  if (generation !== draft.generation) return
  draft.path = path?.file ?? null
  draft.file = file
  if (file.kind === 'broken') draft.status = { text: `${keyConfig.file} ${file.reason}. ${texts.untouched}`, isError: true }
  $.ui.invalidate('ui.render')
}

export function setKeyDraft($: EngineInterface, draft: KeysDraft, id: KeyId, chord: string) {
  draft.drafts = { ...draft.drafts, [id]: chord }
  draft.status = null
  $.ui.invalidate('ui.render')
}

export async function saveKeyDrafts($: EngineInterface, draft: KeysDraft) {
  if (!isKeysSavable(draft)) return
  const generation = draft.generation
  draft.isSaving = true
  draft.status = { text: texts.saving, isError: false }
  $.ui.invalidate('ui.render')
  const saved = await saveKeys($, keyChanges(draft)).catch(error => ({ isSaved: false as const, reason: `${error instanceof Error ? error.message : error}` }))
  const file = await readKeys($)
  if (generation !== draft.generation) return
  draft.isSaving = false
  if (saved.isSaved) {
    draft.file = file
    draft.drafts = {}
    draft.status = { text: texts.saved, isError: false }
  } else draft.status = { text: `${texts.notSaved}${saved.reason}`, isError: true }
  $.ui.invalidate('ui.render')
}

export const leaveKeys = (draft: KeysDraft) => {
  draft.generation += 1
}
