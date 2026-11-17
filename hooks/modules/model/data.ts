import type { EngineInterface, ModelEffort, PromptComposeResult } from 'claude-code'

import { modelColors, pickerConfig } from './config'
import { readEffort, recordEffort } from './effort'

export type Choice = { id: string; name: string; command: string }

export type Models = { choices: Choice[]; model: string; currentId: string | undefined }

export type Efforts = { levels: readonly ModelEffort[]; effort: ModelEffort }

type Known = Record<string, string>

const WIDE = /\[1m\]$/i

const nameParts = (id: string) => {
  const [family = id, ...version] = id.replace(/^claude-/, '').replace(WIDE, '').split('-').filter(part => !/^\d{8}$/.test(part))
  return { family: family.charAt(0).toUpperCase() + family.slice(1), version: version.join('.') }
}

export const displayName = (id: string) => {
  const { family, version } = nameParts(id)
  return [family, version, WIDE.test(id) ? '1M' : ''].filter(Boolean).join(' ')
}

export const familyName = (id: string) => nameParts(id).family

const FAMILY = /^claude-([a-z]+)-/

export const familyOf = (id: string) => id.replace(WIDE, '').match(FAMILY)?.[1]

export const modelColorOf = (family: string | undefined) => (family && modelColors.families[family]) || modelColors.fallback

export const latestIdsIn = (composed: PromptComposeResult) => {
  const line = composed.sections.map(section => section.text.match(pickerConfig.modelIdsLine)?.[0]).find(found => found !== undefined)
  return line === undefined ? [] : [...line.matchAll(pickerConfig.modelId)].flatMap(match => match[1] ? [match[1]] : [])
}

async function readKnown($: EngineInterface): Promise<Known> {
  const value = await $.store.get(pickerConfig.storeKey)
  return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {}
}

export async function rememberIds($: EngineInterface, ids: readonly string[], isLatest: boolean): Promise<Known> {
  const known = await readKnown($)
  const found: Known = {}
  for (const id of ids.map(one => one.replace(WIDE, ''))) {
    const family = familyOf(id)
    if (family && (isLatest || known[family] === undefined)) found[family] = id
  }
  const next = isLatest ? { ...found, ...Object.fromEntries(Object.entries(known).filter(([family]) => found[family] === undefined)) } : { ...known, ...found }
  if (Object.keys(next).join(' ') !== Object.keys(known).join(' ') || Object.keys(next).some(family => next[family] !== known[family])) await $.store.set(pickerConfig.storeKey, next)
  return next
}

const familiesOf = (known: Known) => {
  const seen = Object.keys(known)
  return seen.length > 1 ? seen : [...new Set([...seen, ...pickerConfig.fallbackFamilies])]
}

async function engineRow($: EngineInterface, key: string) {
  return (await $.config.list()).find(row => row.provider.plugin === 'engine' && row.key === key)
}

export async function loadModels($: EngineInterface): Promise<Models> {
  const model = await $.session.model()
  const known = await rememberIds($, [model], false).catch((): Known => ({}))
  const offered = (await engineRow($, pickerConfig.modelKey))?.options
  const families = familiesOf(known)
  const listed = families.filter(one => !offered || offered.some(option => option.includes(one)))
  const family = familyOf(model)
  const commandOf = (id: string) => offered?.includes(id) || known[id] === undefined ? id : known[id]

  return {
    choices: (listed.length > 0 ? listed : families).map(id => ({ id, name: displayName(known[id] ?? id), command: commandOf(id) })),
    model,
    currentId: family && (known[family] === undefined || known[family] === model.replace(WIDE, '')) ? family : undefined,
  }
}

export async function loadEfforts($: EngineInterface): Promise<Efforts> {
  const levels = ((await engineRow($, pickerConfig.effortKey))?.options ?? pickerConfig.levels).filter((level): level is ModelEffort => pickerConfig.levels.some(one => one === level))
  const effort = (await readEffort($)) ?? pickerConfig.defaultEffort

  return {
    levels,
    effort: levels.find(level => level === effort) ?? levels.find(level => level === pickerConfig.defaultEffort) ?? levels[0] ?? pickerConfig.defaultEffort,
  }
}

async function runCommand($: EngineInterface, command: string, args: string) {
  const result = await $.command.run({ command, args })
  if (result.text && pickerConfig.failure.test(result.text)) throw new Error(result.text)
}

export async function switchModel($: EngineInterface, models: Models, choice: Choice, isCurrent: () => boolean) {
  await runCommand($, pickerConfig.modelCommand, choice.command)
  if (!isCurrent()) return false
  models.currentId = choice.id
  models.model = await $.session.model()

  return isCurrent()
}

export async function setEffort($: EngineInterface, efforts: Efforts, effort: ModelEffort, isCurrent: () => boolean) {
  await runCommand($, pickerConfig.effortCommand, effort)
  efforts.effort = effort
  if (isCurrent()) await recordEffort($, effort)
}
