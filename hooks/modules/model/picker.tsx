import type { ModelEffort } from 'claude-code'

import { button, buttonSize, cut, cycle, cycleSize, oneLine, paragraphRow, stack, tabs, tabsShown } from '../../core'
import type { Cycle, CycleOption, PaneZones, StackRow, Ui } from '../../core'
import { effortColors, pickerConfig } from './config'
import { displayName, familyOf, modelColorOf } from './data'
import type { Choice, Efforts, Models } from './data'

export type Draft = {
  models: Promise<Models> | null
  efforts: Promise<Efforts> | null
  selected: string
  model: string | null
  effort: ModelEffort | null
  applying: boolean
  error: string | null
  stops: string[]
}

type Changes = { model: Choice | null; effort: ModelEffort | null }

type PickerProps = {
  run: Draft
  models: Models | null
  efforts: Efforts | null
  isWorking: boolean
  width: number
  rows: number
  redraw: () => void
  apply: () => void
  showAll: () => void
}

export const MODEL = 'picker-model'

export const EFFORT = 'picker-effort'

const APPLY = 'picker-apply'

const ALL = 'picker-all'

const LATEST = 'picker-latest'

const OUTSIDE = ''

const gap = '  '

export const freshDraft = (): Draft => ({ models: null, efforts: null, selected: '', model: null, effort: null, applying: false, error: null, stops: [] })

export const hasEffort = (efforts: Efforts | null): efforts is Efforts => efforts !== null && efforts.levels.length > 0

const currentModel = (models: Models) => models.currentId ?? OUTSIDE

export const draftModel = (run: Draft, models: Models) => run.model ?? currentModel(models)

export const draftEffort = (run: Draft, efforts: Efforts) => run.effort ?? efforts.effort

export const modelOptions = (models: Models): CycleOption[] => [
  ...(models.currentId === undefined ? [{ value: OUTSIDE, label: displayName(models.model) }] : []),
  ...models.choices.map(choice => ({ value: choice.id, label: choice.name })),
]

export const effortOptions = (efforts: Efforts): CycleOption<ModelEffort>[] => efforts.levels.map(level => ({ value: level, label: level }))

export const changesOf = (run: Draft, models: Models | null, efforts: Efforts | null): Changes => {
  const target = models && draftModel(run, models)
  const model = models && target !== currentModel(models) ? models.choices.find(choice => choice.id === target) ?? null : null
  const effort = hasEffort(efforts) && run.effort !== null && (model !== null || run.effort !== efforts.effort) ? run.effort : null
  return { model, effort }
}

export const errorText = (error: unknown) => oneLine(error instanceof Error ? error.message : `${error}`)

const hintOf = (selected: string) => selected === APPLY ? pickerConfig.hints.apply : selected === ALL ? pickerConfig.hints.all : pickerConfig.hints.cycle

export const failureView = (ui: Ui, error: unknown, width: number, close: () => void): PaneZones => {
  const { Box, Text } = ui
  return {
    body: (
      <Box flexDirection="column">
        <Text color="error">{cut(`${pickerConfig.unavailable}${errorText(error)}`, width)}</Text>
        {button(ui, { key: 'picker-close', label: pickerConfig.close, selected: true, width, onPress: close })}
      </Box>
    ),
  }
}

export const pickerView = (ui: Ui, props: PickerProps): PaneZones => {
  const { Box, Text } = ui
  const { run, models, efforts, isWorking, width, rows, redraw } = props
  const { labels } = pickerConfig
  const labelWidth = Math.max(...Object.values(labels).map(label => label.length)) + 2
  const changes = changesOf(run, models, efforts)
  const isBlocked = run.applying || isWorking || (changes.model === null && changes.effort === null)
  const isSelected = (key: string) => run.selected === key

  const edit = (patch: Partial<Pick<Draft, 'model' | 'effort'>>) => {
    if (run.applying) return
    Object.assign(run, patch, { error: null })
    redraw()
  }

  const current = (isCurrent: boolean, name: string, used: number) => {
    const room = width - used - gap.length
    if (isCurrent || room < pickerConfig.currentOf.length + 2) return null
    return <Text dimColor>{gap}{cut(`${pickerConfig.currentOf}${name}`, room)}</Text>
  }

  const carousel = <T extends string>(key: string, control: Omit<Cycle<T>, 'key' | 'labelWidth' | 'selected' | 'width'>, isCurrent: boolean, name: string) => {
    const full: Cycle<T> = { ...control, key, labelWidth, fit: true, selected: isSelected(key), width }
    return <Box key={`${key}-row`}>{cycle(ui, full)}{current(isCurrent, name, cycleSize(full))}</Box>
  }

  const diff = () => [
    changes.model && models ? `${displayName(models.model)}${pickerConfig.arrow}${changes.model.name}` : null,
    changes.effort && efforts && changes.effort !== efforts.effort ? `${efforts.effort}${pickerConfig.arrow}${changes.effort}` : null,
  ].filter(Boolean).join(' · ')

  const status = () => {
    const room = width - buttonSize(pickerConfig.apply) - gap.length
    if (run.applying) return <Text dimColor>{gap}{cut(pickerConfig.applying, room)}</Text>
    if (isWorking) return <Text color="warning">{gap}{cut(pickerConfig.working, room)}</Text>
    const text = diff()
    return text ? <Text bold>{gap}{cut(text, room)}</Text> : <Text dimColor>{gap}{cut(pickerConfig.noChanges, room)}</Text>
  }

  const all: StackRow[] = []
  if (models) {
    const tabRow = { tabs: [{ key: LATEST, label: pickerConfig.latestModels }, { key: ALL, label: pickerConfig.allModels, onPress: props.showAll }], width }
    all.push({
      priority: 4, rows: 1, ...(tabsShown(tabRow).includes(ALL) ? { stop: ALL } : {}),
      draw: () => tabs(ui, { key: 'picker-tabs', ...tabRow, active: LATEST, selected: run.selected }),
    })
    all.push({ priority: 8, rows: 1, draw: () => <Box key="picker-tabs-gap" height={1} /> })
    const value = draftModel(run, models)
    all.push({
      priority: 1, rows: 1, stop: MODEL,
      draw: () => carousel(MODEL, { label: labels.model, options: modelOptions(models), value, onChange: model => edit({ model }), color: modelColorOf(value === OUTSIDE ? familyOf(models.model) : value) }, value === currentModel(models), displayName(models.model)),
    })
  }
  if (hasEffort(efforts)) {
    const value = draftEffort(run, efforts)
    all.push({
      priority: 2, rows: 1, stop: EFFORT,
      draw: () => carousel(EFFORT, { label: labels.effort, options: effortOptions(efforts), value, onChange: effort => edit({ effort }), wrap: false, color: effortColors.levels[value] ?? effortColors.fallback }, value === efforts.effort, efforts.effort),
    })
  } else if (efforts) {
    all.push({ priority: 2, rows: 1, draw: () => <Box key="picker-effort-missing"><Text dimColor>{cut(`${labels.effort}: ${pickerConfig.effortMissing}`, width)}</Text></Box> })
  }
  all.push({ priority: 7, rows: 1, draw: () => <Box key="picker-gap" height={1} /> })
  all.push({
    priority: 3, rows: 1, stop: APPLY,
    draw: () => (
      <Box key="picker-apply-row">
        {button(ui, { key: APPLY, label: pickerConfig.apply, selected: isSelected(APPLY), width, inert: isBlocked, onPress: props.apply })}
        {status()}
      </Box>
    ),
  })
  if (run.error) all.push(paragraphRow(ui, { key: 'picker-error', priority: 5, text: `${pickerConfig.failed}${run.error}`, width, rows: 2, color: 'error' }))
  if (changes.model) all.push(paragraphRow(ui, { key: 'picker-switch-note', priority: 6, text: pickerConfig.switchNote, width, rows: 2, dim: true }))

  const body = stack(ui, { rows: all, room: rows })
  run.stops = body.stops
  if (!run.stops.includes(run.selected)) run.selected = run.stops.find(stop => stop !== ALL) ?? run.stops[0] ?? ''

  return {
    footer: run.applying ? <Text dimColor>{cut(pickerConfig.applying, width)}</Text> : null,
    hint: hintOf(run.selected),
    body: body.draw(),
  }
}
