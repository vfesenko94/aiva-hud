import type { EngineInterface } from 'claude-code'

import { configFolder } from './folder'
import { systemOf } from './system'

type KeySpec = { action: string; context: string; label: string; options: readonly string[]; mac: readonly string[]; fallback: string | null }

export const keyConfig = {
  file: 'keybindings.json',
  backup: 'keybindings.json.aiva-hud.bak',
  schema: 'https://www.schemastore.org/claude-code-keybindings.json',
  shadowing: ['Global', 'Chat'] as readonly string[],
  keys: {
    strip: { action: 'diff:nextSource', context: 'Global', label: 'Strip', options: ['ctrl+down', 'alt+j'], mac: ['ctrl+x s'], fallback: null },
    context: { action: 'diff:back', context: 'Global', label: 'Context', options: ['ctrl+x c', 'alt+c'], mac: ['ctrl+x c'], fallback: null },
    warm: { action: 'diff:nextFile', context: 'Global', label: 'Auto-warm', options: ['alt+w', 'ctrl+x w'], mac: ['ctrl+x w'], fallback: null },
    focus: { action: 'abovePrompt:focus', context: 'Chat', label: 'Pane focus', options: ['alt+s', 'ctrl+x f'], mac: ['ctrl+x f'], fallback: 'ctrl+x tab' },
  } satisfies Record<string, KeySpec>,
}

export type KeyId = keyof typeof keyConfig.keys

export const keyIds = Object.keys(keyConfig.keys) as KeyId[]

type Block = { context: string; bindings: Record<string, unknown> }

type Doc = Record<string, unknown> & { bindings: Block[] }

export type KeysFile = { kind: 'missing' } | { kind: 'read'; text: string; doc: Doc } | { kind: 'broken'; reason: string }

export type KeyChange = { id: KeyId; chord: string | null }

export type Keys = { chords: Record<KeyId, string | null>; isMac: boolean }

export const createKeys = (): Keys => ({ chords: { strip: null, context: null, warm: null, focus: null }, isMac: false })

export const offeredChords = (keys: Readonly<Keys>, id: KeyId): readonly string[] => (keys.isMac ? keyConfig.keys[id].mac : keyConfig.keys[id].options)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const isBlock = (value: unknown): value is Block => isRecord(value) && typeof value.context === 'string' && isRecord(value.bindings)

export function parseKeys(text: string): KeysFile {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch (error) {
    return { kind: 'broken', reason: `not valid JSON (${error instanceof Error ? error.message : error})` }
  }
  if (!isRecord(doc)) return { kind: 'broken', reason: 'not a JSON object' }
  if (doc.bindings === undefined) return { kind: 'read', text, doc: { ...doc, bindings: [] } }
  if (!Array.isArray(doc.bindings) || !doc.bindings.every(isBlock)) return { kind: 'broken', reason: '"bindings" is not a list of { context, bindings }' }
  return { kind: 'read', text, doc: doc as Doc }
}

export function boundChord(file: KeysFile, id: KeyId): string | null {
  if (file.kind !== 'read') return null
  const { action, context } = keyConfig.keys[id]
  const found = (block: Block) => Object.keys(block.bindings).find(chord => block.bindings[chord] === action)
  const own = file.doc.bindings.filter(block => block.context === context).map(found).find(Boolean)
  return own ?? file.doc.bindings.map(found).find(Boolean) ?? null
}

const ourActions = new Set<string>(keyIds.map(id => keyConfig.keys[id].action))

const normalChord = (chord: string) => chord.trim().toLowerCase().replace(/\s+/g, ' ')

export function takenBy(file: KeysFile, changes: readonly KeyChange[], change: KeyChange): string | null {
  if (!change.chord) return null
  const chord = normalChord(change.chord)
  const twin = changes.find(other => other.id !== change.id && other.chord && normalChord(other.chord) === chord)
  if (twin) return keyConfig.keys[twin.id].label
  if (file.kind !== 'read') return null
  const moving = new Set(changes.map(one => keyConfig.keys[one.id].action))
  for (const block of file.doc.bindings) {
    if (!keyConfig.shadowing.includes(block.context)) continue
    for (const [bound, action] of Object.entries(block.bindings)) {
      if (normalChord(bound) !== chord) continue
      if (action === keyConfig.keys[change.id].action || (typeof action === 'string' && moving.has(action) && ourActions.has(action))) continue
      return typeof action === 'string' ? action : 'another binding'
    }
  }
  return null
}

export function applyKeys(file: KeysFile, changes: readonly KeyChange[]): Doc | null {
  if (file.kind === 'broken') return null
  const source: Doc = file.kind === 'read' ? file.doc : { $schema: keyConfig.schema, bindings: [] }
  const actions = new Set(changes.map(change => keyConfig.keys[change.id].action))
  const bindings = source.bindings.map(block => ({
    ...block,
    bindings: Object.fromEntries(Object.entries(block.bindings).filter(([, action]) => !(typeof action === 'string' && actions.has(action)))),
  }))
  for (const change of changes) {
    if (!change.chord) continue
    const { action, context } = keyConfig.keys[change.id]
    const block = bindings.find(one => one.context === context)
    if (block) block.bindings[change.chord] = action
    else bindings.push({ context, bindings: { [change.chord]: action } })
  }
  return { ...source, bindings }
}

const textOf = (doc: Doc, previous: string | null) => {
  const text = `${JSON.stringify(doc, null, 2)}\n`
  return previous?.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text
}

export async function keysPath($: EngineInterface) {
  const folder = await configFolder($)
  return folder ? { file: `${folder}/${keyConfig.file}`, backup: `${folder}/${keyConfig.backup}` } : null
}

export async function readKeys($: EngineInterface): Promise<KeysFile> {
  const path = await keysPath($)
  if (!path) return { kind: 'broken', reason: 'the Claude config folder was not found' }
  if (!(await $.fs.exists(path.file).catch(() => true))) return { kind: 'missing' }
  return $.fs.read(path.file).then(parseKeys, error => ({ kind: 'broken', reason: `could not be read (${error instanceof Error ? error.message : error})` }))
}

export async function loadKeys($: EngineInterface, keys: Keys) {
  keys.isMac = (await systemOf($)) === 'mac'
  const file = await readKeys($)
  keys.chords = Object.fromEntries(keyIds.map(id => [id, boundChord(file, id) ?? keyConfig.keys[id].fallback])) as Keys['chords']
}

export type SaveResult = { isSaved: true } | { isSaved: false; reason: string }

export async function saveKeys($: EngineInterface, changes: readonly KeyChange[]): Promise<SaveResult> {
  const path = await keysPath($)
  if (!path) return { isSaved: false, reason: 'the Claude config folder was not found' }
  const file = await readKeys($)
  if (file.kind === 'broken') return { isSaved: false, reason: `${keyConfig.file} is ${file.reason}; nothing was changed` }
  const taken = changes.map(change => takenBy(file, changes, change)).find(Boolean)
  if (taken) return { isSaved: false, reason: `a key is already used by ${taken}; nothing was changed` }
  const doc = applyKeys(file, changes)
  if (!doc) return { isSaved: false, reason: 'nothing was changed' }
  const previous = file.kind === 'read' ? file.text : null
  const text = textOf(doc, previous)
  try {
    if (previous !== null) {
      await $.fs.write(path.backup, previous)
      if ((await $.fs.read(path.backup)) !== previous) return { isSaved: false, reason: 'the backup could not be verified; nothing was changed' }
    }
    await $.fs.write(path.file, text)
  } catch (error) {
    return { isSaved: false, reason: `${error instanceof Error ? error.message : error}` }
  }
  const written = await readKeys($)
  if (written.kind !== 'read' || changes.some(change => boundChord(written, change.id) !== change.chord)) {
    return { isSaved: false, reason: `the saved file did not read back as expected; the previous one is in ${keyConfig.backup}` }
  }
  return { isSaved: true }
}
