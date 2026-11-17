import type { EngineInterface } from 'claude-code'

import type { Step, StepTool } from '../../../../types'
import { contextConfig } from '../config'

type Fields = Readonly<Record<string, unknown>>

export type Stored = { at: number; steps: Step[] } | { at: number; text: string }

export const turnKey = (turnId: string) => `${contextConfig.storage.prefix}turn:${turnId}`

export const compactKey = (at: number) => `${contextConfig.storage.prefix}compact:${at}`

export const isHistoryKey = (key: string) => key.startsWith(contextConfig.storage.prefix)

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)

const isOptional = (record: Fields, key: string, type: 'string' | 'number' | 'boolean') =>
  record[key] === undefined || typeof record[key] === type

const isTool = (value: unknown): value is StepTool =>
  isFields(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.brief === 'string' &&
  (value.resultTokens === null || typeof value.resultTokens === 'number') &&
  typeof value.isError === 'boolean' &&
  ['about', 'subject', 'wrote', 'outcome'].every(key => isOptional(value, key, 'string')) &&
  ['callTokens', 'repeatOf'].every(key => isOptional(value, key, 'number'))

const isStep = (value: unknown): value is Step =>
  isFields(value) &&
  typeof value.turnId === 'string' &&
  ['index', 'at', 'context', 'output'].every(key => typeof value[key] === 'number') &&
  ['answerTokens', 'cached', 'written'].every(key => isOptional(value, key, 'number')) &&
  isOptional(value, 'isFromStart', 'boolean') &&
  Array.isArray(value.tools) &&
  value.tools.every(isTool)

export const parseSteps = (value: unknown): Step[] | null =>
  isFields(value) && Array.isArray(value.steps) && value.steps.every(isStep) ? value.steps : null

export const parseSummary = (value: unknown): string | null => (isFields(value) && typeof value.text === 'string' ? value.text : null)

export const storedAt = (value: unknown): number | null => (isFields(value) && typeof value.at === 'number' ? value.at : null)

export function readStored($: EngineInterface, key: string): Promise<unknown> {
  return $.store.get(key).catch(() => undefined)
}
