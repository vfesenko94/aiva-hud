import type { Color, EngineInterface, On, RenderElement, RenderInput, UiPane } from 'claude-code'

import { button, buttonSize, cacheGlyph, checkbox, checkboxSize, choice, choiceSize, closePaneState, createMoveGuard, cut, cycle, cycleSize, cycleStep, focusElement, gridMove, hidePaneState, keyConfig, keyIds, notePaneState, paragraphRow, registerPaneClose, registerPanePress, scrollbar, scrollbarSize, scrollIntent, showPaneState, shownFrame, stack, stepOf } from '../../core'
import type { Cell, CycleOption, Direction, Display, HintKey, KeyId, StackRow, Ui } from '../../core'
import { settingsConfig } from './config'
import { defaultSettings } from './schema'
import type { Displays, Part, Section, Shown } from './schema'
import { draftChord, isKeysSavable, keyNote, keyOptions, leaveKeys, openKeys, saveKeyDrafts, setKeyDraft } from './keys'
import { checkStar, dismissStar, giveStar, isStarAsked } from './star'
import { saveSettings } from './store'
import type { Settings } from './store'

type Module = (typeof settingsConfig.modules)[number]

type Choice = { label: string; options: CycleOption[]; value: string; color?: Color; disabled?: boolean; onChange: (value: string) => void }

type Note = { text: string; color?: Color }

type Toggle = { label: string; isOn: boolean; disabled?: boolean; onToggle: () => void }

type Press = { label: string; inert: boolean; disabled?: boolean; onPress: () => void }

type Row = { key: string; note: Note | null } & ({ choice: Choice; toggle?: never; press?: never } | { toggle: Toggle; choice?: never; press?: never } | { press: Press; choice?: never; toggle?: never })

type Item = { face: RenderElement; isPointed: boolean }

const ROW = 'settings-'

const SECTION = `${ROW}section-`

const HINT = `${ROW}hint-`

const WITH_EFFORT = '+effort'

const BACK = `${ROW}back`

const MODULE = `${ROW}module`

const TOGGLE = `${ROW}toggle`

const FORMAT = `${ROW}format`

const HOVER = `${ROW}hover`

const CACHE = `${ROW}cache`

const CACHE_FORMAT = `${ROW}cache-format`

const CACHE_UNTIL = `${ROW}cache-until`

const RESET = `${ROW}reset`

const RESET_CANCEL = `${ROW}reset-cancel`

const RESET_CONFIRM = `${ROW}reset-confirm`

const KEY = `${ROW}key-`

const KEYS_SAVE = `${ROW}keys-save`

const STAR = `${ROW}star`

const STAR_HIDE = `${ROW}star-hide`

const { modules, displays, labels } = settingsConfig

const sections = Object.keys(settingsConfig.sections) as Section[]

const hintKeys = Object.keys(settingsConfig.hints) as HintKey[]

const sectionKey = (section: Section) => `${SECTION}${section}`

const isShown = (key: Part): key is Shown => Object.keys(displays).includes(key)

const formatOf = (key: Shown, format: string | null) => format === null ? undefined : (displays[key].formats as Record<string, { label: string; hint?: string }>)[format]

const formatOptions = (key: Shown): CycleOption[] => Object.keys(displays[key].formats).map(value => ({ value, label: formatOf(key, value)?.label ?? value }))

const modelOptions = (): CycleOption[] => formatOptions('model').flatMap(option => [{ value: `${option.value}${WITH_EFFORT}`, label: `${option.label} ${settingsConfig.effort.sample}` }, option])

const readingOf = (settings: Settings, key: Shown, format: string | null) => {
  const label = formatOf(key, format)?.label
  return label && key === 'model' && settings.value.activity.effort ? `${label} ${settingsConfig.effort.sample}` : label
}

const moduleOf = (settings: Settings) => modules.find(module => module.key === settings.module) ?? modules[0]

export const isSettingsShown = (settings: Settings) => settings.visibility.isShown

function setDisplay($: EngineInterface, settings: Settings, key: Shown, display: Display<string> & { until?: boolean }, selected: string) {
  const next = { ...display, hover: display.hover === display.format ? null : display.hover }
  settings.value = { ...settings.value, display: { ...settings.value.display, [key]: next } as Displays }
  settings.selected = selected
  $.ui.invalidate('ui.render')
  void saveSettings($, settings)
}

function setHint($: EngineInterface, settings: Settings, key: HintKey, isOn: boolean) {
  settings.value = { ...settings.value, hints: { ...settings.value.hints, [key]: isOn } }
  settings.selected = `${HINT}${key}`
  $.ui.invalidate('ui.render')
  void saveSettings($, settings)
}

function selectModule($: EngineInterface, settings: Settings, key: string) {
  const module = modules.find(one => one.key === key)
  if (!module) return
  settings.module = module.key
  $.ui.invalidate('ui.render')
}

const toggleOf = (isOn: boolean, onToggle: () => void, isLocked = false): Toggle => ({ label: labels.toggle, isOn, onToggle, ...(isLocked ? { disabled: true } : {}) })

const controlOf = (row: Row): Choice | Toggle | Press => {
  if (row.choice) return row.choice
  return row.toggle ?? row.press
}

const labelEnd = ': '

const lockedNote: Note ={ text: settingsConfig.lockedNote, color: 'warning' }

function hudRows($: EngineInterface, settings: Settings, toggle: (part: Part) => void, focus: string): Row[] {
  const module = moduleOf(settings)
  if (!module) return []
  const { key } = module
  const isOn = settings.value.activity[key]
  const rows: Row[] = [
    {
      key: MODULE,
      choice: { label: labels.module, options: modules.map(one => ({ value: one.key, label: one.label })), value: key, onChange: value => selectModule($, settings, value) },
      note: focus === MODULE && module.description ? { text: module.description } : null,
    },
    {
      key: TOGGLE,
      toggle: toggleOf(isOn, () => {
        settings.selected = TOGGLE
        toggle(key)
      }, module.isLocked),
      note: module.isLocked ? lockedNote : module.note ? { text: module.note } : null,
    },
  ]
  if (!isOn || !isShown(key)) return rows
  const display: Display<string> = settings.value.display[key]
  const isModel = key === 'model'
  const formats = isModel ? modelOptions() : formatOptions(key)
  const hintOf = (format: string | null) => formatOf(key, format)?.hint ?? ''
  const hover = hintOf(display.hover)
  const formatHint = isModel ? (settings.value.activity.effort ? settingsConfig.effort.hint : '') : hintOf(display.format)
  const changeFormat = (value: string) => {
    const format = value.endsWith(WITH_EFFORT) ? value.slice(0, -WITH_EFFORT.length) : value
    if (isModel && value.endsWith(WITH_EFFORT) !== settings.value.activity.effort) toggle('effort')
    setDisplay($, settings, key, { ...display, format }, FORMAT)
  }
  return [
    ...rows,
    ...(formats.length > 1 ? [{
      key: FORMAT,
      choice: { label: labels.format, options: formats, value: isModel && settings.value.activity.effort ? `${display.format}${WITH_EFFORT}` : display.format, onChange: changeFormat },
      note: focus === FORMAT && formatHint ? { text: formatHint } : null,
    }] : []),
    ...(displays[key].hasHover ? [{
      key: HOVER,
      choice: {
        label: labels.hover,
        options: [{ value: '', label: settingsConfig.none }, ...formatOptions(key).filter(format => format.value !== display.format)],
        value: display.hover ?? '',
        onChange: (value: string) => setDisplay($, settings, key, { ...display, hover: value || null }, HOVER),
      },
      note: focus === HOVER && hover ? { text: `${settingsConfig.hoverHint}${hover}` } : null,
    }] : []),
  ]
}

function cacheRows($: EngineInterface, settings: Settings, toggle: (part: Part) => void): Row[] {
  const isOn = settings.value.activity.cache
  const display = settings.value.display.cache
  const { hidden, shown } = settingsConfig.hintOptions
  return [
    {
      key: CACHE,
      toggle: toggleOf(isOn, () => {
        settings.selected = CACHE
        toggle('cache')
      }),
      note: { text: settingsConfig.cacheNote },
    },
    ...(isOn ? [{
      key: CACHE_FORMAT,
      choice: { label: labels.format, options: formatOptions('cache'), value: display.format, onChange: (format: string) => setDisplay($, settings, 'cache', { ...display, format }, CACHE_FORMAT) },
      note: null,
    }, {
      key: CACHE_UNTIL,
      choice: {
        label: labels.until,
        options: [{ value: 'hidden', label: hidden }, { value: 'shown', label: shown }],
        value: display.until ? 'shown' : 'hidden',
        onChange: (value: string) => setDisplay($, settings, 'cache', { ...display, until: value === 'shown' }, CACHE_UNTIL),
      },
      note: null,
    }] : []),
  ]
}

const keyRowOf = (id: KeyId) => `${KEY}${id}`

function keysRows($: EngineInterface, settings: Settings): Row[] {
  const draft = settings.keys
  const { texts } = settingsConfig.keys
  const isReady = draft.file !== null && draft.file.kind !== 'broken'
  const isLocked = !isReady || draft.isSaving
  const rows: Row[] = keyIds.map(id => ({
    key: keyRowOf(id),
    choice: {
      label: keyConfig.keys[id].label,
      options: keyOptions(draft, settings.panes.keys, id),
      value: draftChord(draft, id),
      ...(isLocked ? { disabled: true } : {}),
      onChange: (chord: string) => {
        settings.selected = keyRowOf(id)
        setKeyDraft($, draft, id, chord)
      },
    },
    note: isReady ? keyNote(draft, id) : null,
  }))
  const status = draft.status ?? { text: draft.file === null ? texts.reading : isKeysSavable(draft) ? `${texts.backup}${keyConfig.backup}` : texts.noChanges, isError: false }
  return [
    ...rows,
    {
      key: KEYS_SAVE,
      press: { label: texts.save, inert: !isKeysSavable(draft), ...(isReady ? {} : { disabled: true }), onPress: () => void saveKeyDrafts($, draft) },
      note: { text: status.text, ...(status.isError ? { color: 'error' as Color } : status.text === texts.saved ? { color: 'success' as Color } : {}) },
    },
  ]
}

function rowsOf($: EngineInterface, settings: Settings, toggle: (part: Part) => void, focus: string): Row[] {
  if (settings.section === 'hud') return hudRows($, settings, toggle, focus)
  if (settings.section === 'cache') return cacheRows($, settings, toggle)
  if (settings.section === 'keys') return keysRows($, settings)
  return []
}

const faceOf = ({ Text }: Ui, module: Module, text: string, isPointed: boolean, isOff: boolean, isHovered: boolean, hasEffort: boolean) => {
  if (isOff) return Text({ dimColor: true, ...(isPointed ? { strikethrough: true } : {}), children: text })
  if (!isPointed) return Text({ dimColor: true, children: text })
  if (isHovered) return Text({ color: module.color, inverse: true, children: text })
  const { sample, color } = settingsConfig.effort
  const lead = module.prefix ? `${module.prefix} ` : ''
  const from = lead && text.trimStart().startsWith(lead) ? text.indexOf(lead) + lead.length : 0
  const to = hasEffort && text.endsWith(sample) ? text.length - sample.length : text.length
  return Text({
    bold: true,
    children: [
      ...(from ? [Text({ dimColor: true, children: text.slice(0, from) })] : []),
      Text({ color: module.color, children: text.slice(from, to) }),
      ...(to < text.length ? [Text({ color, children: text.slice(to) })] : []),
    ],
  })
}

const previewLine = ({ Box }: Ui, width: number, children: RenderElement[]) => Box({
  key: `${ROW}preview`,
  flexDirection: 'row',
  height: 1,
  width,
  flexShrink: 0,
  overflow: 'hidden',
  children,
})

function hudPreview(ui: Ui, settings: Settings, focus: string, width: number): RenderElement {
  const { Text } = ui
  const current = moduleOf(settings)
  const blocks: Item[] = modules.filter(module => settings.value.activity[module.key] || module.key === current?.key).map(module => {
    const isPointed = module.key === current?.key
    const isOff = !settings.value.activity[module.key]
    const isHovered = isPointed && focus === HOVER
    const display: Display<string> | null = isShown(module.key) ? settings.value.display[module.key] : null
    const shown = (isShown(module.key) && display ? readingOf(settings, module.key, display.format) : module.sample) ?? ''
    const alternate = (isShown(module.key) && display?.hover ? readingOf(settings, module.key, display.hover) : null) ?? shown
    const room = Math.max(shown.length, alternate.length)
    const value = isHovered ? alternate : shown
    const left = Math.floor((room - value.length) / 2)
    const text = `${' '.repeat(left)}${value}`.padEnd(room)
    return {
      isPointed,
      face: faceOf(ui, module, text, isPointed, isOff, isHovered, module.key === 'model' && settings.value.activity.effort),
    }
  })
  const { pointer } = settingsConfig
  const isCurrentOn = current ? settings.value.activity[current.key] : false
  const arrow = (glyph: string) => Text({ ...(isCurrentOn ? { bold: true, color: pointer.color } : { dimColor: true }), children: glyph })
  return previewLine(ui, width, blocks.flatMap((item, at) => {
    const left = blocks[at - 1]
    if (!left) return item.isPointed ? [arrow(pointer.before.trimStart()), item.face] : [item.face]
    const gap = item.isPointed ? arrow(pointer.before) : left.isPointed ? arrow(pointer.after) : Text({ dimColor: true, children: settingsConfig.separator })
    return [gap, item.face]
  }))
}

const sectionPreview = (ui: Ui, settings: Settings, width: number): RenderElement | null => {
  const { Text } = ui
  if (settings.section === 'keys') {
    const path = settings.keys.path
    return path ? previewLine(ui, width, [Text({ dimColor: true, children: cut(`${settingsConfig.keys.texts.file}${path}`, width) })]) : null
  }
  if (settings.section === 'cache') {
    const isOn = settings.value.activity.cache
    const { format, until } = settings.value.display.cache
    const off = isOn ? {} : { dimColor: true, strikethrough: true }
    return previewLine(ui, width, [
      Text({ bold: isOn, ...(isOn ? { color: 'success' as Color } : off), children: `${cacheGlyph} ${formatOf('cache', format)?.label ?? ''}` }),
      ...(until ? [Text({ dimColor: true, ...off, children: settingsConfig.cacheUntil })] : []),
    ])
  }
  return null
}

const hintKeyOf = (key: HintKey) => `${HINT}${key}`

const hintPreview = (ui: Ui, settings: Settings, key: HintKey, width: number) => {
  const { Text } = ui
  const { hintsPill, separator } = settingsConfig
  const text = settingsConfig.hints[key]
  return previewLine(ui, width, [
    Text({ color: hintsPill.color, children: hintsPill.text }),
    Text({ dimColor: true, children: text.startsWith('(') ? ' ' : separator }),
    Text({ dimColor: true, ...(settings.value.hints[key] ? {} : { strikethrough: true }), children: text }),
  ])
}

function hintsBody(ui: Ui, $: EngineInterface, settings: Settings, focus: string, width: number, rows: number): RenderElement {
  const { Box } = ui
  const pointed = Math.max(0, hintKeys.findIndex(key => hintKeyOf(key) === focus))
  const hasPreview = rows >= 3
  const hasGap = rows >= 6
  const room = Math.max(1, rows - (hasPreview ? 1 : 0) - (hasGap ? 1 : 0))
  const first = Math.max(0, Math.min(hintKeys.length - room, pointed, Math.max(settings.first, pointed - room + 1)))
  settings.first = first
  const bar = scrollbar(ui, { key: `${ROW}hints-bar`, rows: room, total: hintKeys.length, first })
  const listWidth = Math.max(1, width - (bar ? scrollbarSize + 1 : 0))
  const shown = hintKeys[pointed]
  const list = hintKeys.slice(first, first + room).map(key => Box({
    key: `${hintKeyOf(key)}-line`,
    height: 1,
    flexShrink: 0,
    children: checkbox(ui, { key: hintKeyOf(key), label: settingsConfig.hints[key], checked: settings.value.hints[key], selected: focus === hintKeyOf(key), width: listWidth, onToggle: () => setHint($, settings, key, !settings.value.hints[key]) }),
  }))
  return Box({
    flexDirection: 'column',
    width,
    height: rows,
    children: [
      ...(hasPreview && shown ? [hintPreview(ui, settings, shown, width)] : []),
      ...(hasGap ? [Box({ key: `${ROW}preview-gap`, height: 1, flexShrink: 0 })] : []),
      Box({ key: `${ROW}hints`, flexDirection: 'row', height: room, flexShrink: 0, justifyContent: 'space-between', children: [Box({ flexDirection: 'column', width: listWidth, children: list }), ...(bar ? [bar] : [])] }),
    ],
  })
}

const moreOf = (keys: readonly string[], kept: readonly string[]) => {
  const first = keys.indexOf(kept[0] ?? '')
  const last = keys.indexOf(kept[kept.length - 1] ?? '')
  if (first < 0 || last < 0) return ''
  const { above, below, label } = settingsConfig.more
  const parts = [...(first > 0 ? [`${above}${first}`] : []), ...(last < keys.length - 1 ? [`${below}${keys.length - 1 - last}`] : [])]
  return parts.length ? `${parts.join(' ')} ${label}` : ''
}

const helpOf = (settings: Settings, focus: string) => {
  const { help } = settingsConfig
  if (!settings.section) return settings.isResetting ? help.reset : focus === STAR || focus === STAR_HIDE ? help.star : help.list
  if (focus === BACK) return help.back
  if (settings.section === 'hints') return help.check
  if (focus === KEYS_SAVE) return help.save
  return focus === MODULE ? help.module : focus === TOGGLE || focus === CACHE ? help.check : help.choice
}

async function focusKey($: EngineInterface, settings: Settings, key: string) {
  settings.selected = key
  $.ui.invalidate('ui.render')
  await focusElement($, settingsConfig.id, key)
}

const leaveSection = (settings: Settings) => {
  settings.generation += 1
  if (settings.section === 'keys') leaveKeys(settings.keys)
  settings.selected = sectionKey(settings.section ?? sections[0] ?? 'hud')
  settings.section = null
}

function enterSection($: EngineInterface, settings: Settings, section: Section, toggle: (part: Part) => void) {
  settings.generation += 1
  settings.section = section
  settings.first = 0
  if (section === 'keys') {
    const generation = settings.generation
    void openKeys($, settings.keys).then(() => {
      const first = keyIds[0]
      if (first && generation === settings.generation && settings.selected === BACK && settings.keys.file?.kind !== 'broken') void focusKey($, settings, keyRowOf(first))
    })
  }
  const first = section === 'hints' ? hintKeyOf(hintKeys[0] ?? 'cycle') : rowsOf($, settings, toggle, '').find(row => !controlOf(row).disabled)?.key ?? BACK
  void focusKey($, settings, first)
}

function askReset($: EngineInterface, settings: Settings) {
  settings.generation += 1
  settings.isResetting = true
  void focusKey($, settings, RESET_CANCEL)
}

const leaveReset = (settings: Settings) => {
  settings.generation += 1
  settings.isResetting = false
  settings.selected = RESET
}

function cancelReset($: EngineInterface, settings: Settings) {
  leaveReset(settings)
  void focusKey($, settings, RESET)
}

function confirmReset($: EngineInterface, settings: Settings, toggle: (part: Part) => void) {
  const { activity, display, hints } = defaultSettings()
  settings.value = { ...settings.value, display, hints }
  for (const part of Object.keys(activity) as Part[]) {
    if (settings.value.activity[part] !== activity[part]) toggle(part)
  }
  void saveSettings($, settings)
  cancelReset($, settings)
}

function resetLine(ui: Ui, $: EngineInterface, settings: Settings, focus: string, width: number, toggle: (part: Part) => void): RenderElement {
  const { Box, Text } = ui
  const { reset, sectionGap } = settingsConfig
  const line = (children: RenderElement[]) => Box({ key: `${RESET}-line`, flexDirection: 'row', columnGap: sectionGap - 1, height: 1, flexShrink: 0, children })
  if (!settings.isResetting) return line([button(ui, { key: RESET, label: reset.label, selected: focus === RESET, width: Math.min(width, buttonSize(reset.label)), onPress: () => askReset($, settings) })])
  const buttons = buttonSize(reset.cancel) + buttonSize(reset.confirm) + sectionGap - 1
  const room = width - buttons - sectionGap + 1
  return line([
    ...(room > 3 ? [Text({ children: cut(reset.question, room) })] : []),
    button(ui, { key: RESET_CANCEL, label: reset.cancel, selected: focus === RESET_CANCEL, width: buttonSize(reset.cancel), onPress: () => cancelReset($, settings) }),
    button(ui, { key: RESET_CONFIRM, label: reset.confirm, selected: focus === RESET_CONFIRM, width: buttonSize(reset.confirm), color: reset.color, onPress: () => confirmReset($, settings, toggle) }),
  ])
}

function leaveStar($: EngineInterface, settings: Settings) {
  if (settings.visibility.isShown && (settings.selected === STAR || settings.selected === STAR_HIDE)) void focusKey($, settings, RESET)
}

async function pressStar($: EngineInterface, settings: Settings) {
  await giveStar($, settings.star)
  leaveStar($, settings)
}

function hideStar($: EngineInterface, settings: Settings) {
  void dismissStar($, settings.star)
  leaveStar($, settings)
}

const starButtons = buttonSize(settingsConfig.star.texts.give) + buttonSize(settingsConfig.star.texts.hide) + settingsConfig.sectionGap - 1

const starLeadSize = settingsConfig.star.glyph.length + 1

const hasStarRoom = (settings: Settings, rows: number) => isStarAsked(settings.star) && rows >= sections.length + 2

const starRowsOf = (settings: Settings, width: number, rows: number) => {
  if (!hasStarRoom(settings, rows)) return 0
  const isInline = starLeadSize + settingsConfig.star.texts.ask.length + settingsConfig.sectionGap - 1 + starButtons <= width
  return settings.star.isHidden || isInline || rows < sections.length + 3 ? 1 : 2
}

function starLines(ui: Ui, $: EngineInterface, settings: Settings, focus: string, width: number, isStacked: boolean): RenderElement[] {
  const { Box, Text } = ui
  const { star } = settings
  const { glyph, color, thanksColor, texts } = settingsConfig.star
  const { sectionGap } = settingsConfig
  const line = (key: string, children: RenderElement[]) => Box({ key, flexDirection: 'row', columnGap: sectionGap - 1, height: 1, flexShrink: 0, children })
  if (star.isHidden) return [line(`${STAR}-line`, [Text({ color: thanksColor, children: cut(`${glyph} ${star.thanks ?? ''}`, width) })])]
  const room = isStacked ? width : width - starButtons - sectionGap + 1
  const ask = Text({ children: [Text({ color, children: glyph }), Text({ dimColor: true, children: ` ${cut(star.isBusy ? texts.busy : texts.ask, room - starLeadSize)}` })] })
  const inert = settings.isResetting || star.isBusy ? { inert: true } : {}
  const buttons = [
    button(ui, { key: STAR, label: texts.give, selected: focus === STAR, width: buttonSize(texts.give), color, ...inert, onPress: () => void pressStar($, settings) }),
    button(ui, { key: STAR_HIDE, label: texts.hide, selected: focus === STAR_HIDE, width: buttonSize(texts.hide), ...inert, onPress: () => hideStar($, settings) }),
  ]
  if (isStacked) return [line(`${STAR}-line`, [ask]), line(`${STAR}-buttons`, buttons)]
  return [line(`${STAR}-line`, [...(room > starLeadSize + 1 ? [ask] : []), ...buttons])]
}

function menuOf(ui: Ui, $: EngineInterface, settings: Settings, focus: string, width: number, rows: number, toggle: (part: Part) => void): RenderElement {
  const { Box, Text } = ui
  const { sections: titles, sectionDescriptions, sectionGap } = settingsConfig
  const labelRoom = Math.max(...sections.map(section => titles[section].length))
  const size = Math.min(width, choiceSize(''.padEnd(labelRoom)))
  const room = width - size - sectionGap
  const lines = sections.map(section => {
    const key = sectionKey(section)
    return Box({
      key: `${key}-line`,
      flexDirection: 'row',
      height: 1,
      flexShrink: 0,
      children: [
        choice(ui, { key, label: titles[section].padEnd(labelRoom), selected: focus === key, width: size, ...(settings.isResetting ? { inert: true } : {}), onPress: () => enterSection($, settings, section, toggle) }),
        ...(room > 3 ? [' '.repeat(sectionGap), Text({ dimColor: true, children: cut(sectionDescriptions[section], room) })] : []),
      ],
    })
  })
  const starRows = starRowsOf(settings, width, rows)
  const spare = rows - sections.length - 1 - starRows
  return Box({
    flexDirection: 'column',
    children: [
      ...lines,
      ...(spare > 0 ? [Box({ key: `${RESET}-gap`, height: 1, flexShrink: 0 })] : []),
      resetLine(ui, $, settings, focus, width, toggle),
      ...(starRows && spare > 1 ? [Box({ key: `${STAR}-gap`, height: 1, flexShrink: 0 })] : []),
      ...(starRows ? starLines(ui, $, settings, focus, width, starRows > 1) : []),
    ],
  })
}

export function noteSettings(settings: Settings, panes: readonly UiPane[]) {
  notePaneState(settings.visibility, panes, settingsConfig.id)
}

export async function showSettings($: EngineInterface, settings: Settings) {
  const generation = settings.generation + 1
  const opening = showPaneState($, settings.panes, settingsConfig, settings.visibility, () => generation === settings.generation)
  settings.generation = generation
  settings.section = null
  settings.isResetting = false
  settings.star.thanks = null
  settings.selected = sectionKey(sections[0] ?? 'hud')
  if (await opening) void checkStar($, settings.star)
}

export function closeSettings($: EngineInterface, settings: Settings) {
  settings.generation += 1
  return closePaneState($, settingsConfig, settings.visibility)
}

export function activateSettings($: EngineInterface, settings: Settings) {
  return settings.visibility.isShown ? closeSettings($, settings) : showSettings($, settings)
}

export async function renderSettings($: EngineInterface, settings: Settings, e: RenderInput<'Pane'>, toggle: (part: Part) => void) {
  const pane = await shownFrame($, e, settings.panes, settingsConfig, settings.visibility)
  if (!pane) return $.ui.resolve(e).Box({})
  const ui = pane.ui
  const { Box, Text } = ui
  const width = Math.max(1, Math.min(e.props.bodyColumns, settingsConfig.contentColumns))
  const { section } = settings
  if (!section) {
    settings.navigation = settings.isResetting
      ? [{ key: RESET_CANCEL, row: 0, column: 0 }, { key: RESET_CONFIRM, row: 0, column: 1 }]
      : [
          ...sections.map((one, row) => ({ key: sectionKey(one), row, column: 0 })),
          { key: RESET, row: sections.length, column: 0 },
          ...(hasStarRoom(settings, pane.rows) && !settings.star.isHidden ? [{ key: STAR, row: sections.length + 1, column: 0 }, { key: STAR_HIDE, row: sections.length + 1, column: 1 }] : []),
        ]
    if (!settings.navigation.some(cell => cell.key === settings.selected)) settings.selected = settings.navigation[0]?.key ?? ''
    const focus = settings.selected
    return pane.frame({ hint: helpOf(settings, focus), body: menuOf(ui, $, settings, focus, width, pane.rows, toggle) })
  }
  const headerOf = (focus: string, extra: string) => Box({
    key: `${ROW}title`,
    flexDirection: 'row',
    columnGap: 2,
    children: [
      button(ui, { key: BACK, label: settingsConfig.back, selected: focus === BACK, width, onPress: () => {
        leaveSection(settings)
        void focusKey($, settings, settings.selected)
      } }),
      Text({ bold: true, children: cut(settingsConfig.sections[section], Math.max(1, width - buttonSize(settingsConfig.back) - 2 - (extra ? extra.length + 2 : 0))) }),
      ...(extra ? [Text({ dimColor: true, children: extra })] : []),
    ],
  })
  if (section === 'hints') {
    settings.navigation = [{ key: BACK, row: 0, column: 0 }, ...hintKeys.map((key, at): Cell => ({ key: hintKeyOf(key), row: at + 1, column: 0 }))]
    if (!settings.navigation.some(cell => cell.key === settings.selected)) settings.selected = BACK
    const focus = settings.selected
    const hidden = hintKeys.filter(key => !settings.value.hints[key]).length
    const count = hidden ? `${hidden}${settingsConfig.hintsHidden}` : ''
    return pane.frame({ header: headerOf(focus, count), hint: helpOf(settings, focus), body: hintsBody(ui, $, settings, focus, width, pane.rows) })
  }
  const rows = rowsOf($, settings, toggle, settings.selected)
  const stops = rows.filter(row => !controlOf(row).disabled)
  settings.navigation = [
    { key: BACK, row: 0, column: 0 },
    ...stops.map((row, at): Cell => ({ key: row.key, row: at + 1, column: 0, ...(row.choice ? { step: by => row.choice.onChange(cycleStep(row.choice, by)) } : {}) })),
  ]
  if (!settings.navigation.some(cell => cell.key === settings.selected)) settings.selected = BACK
  const focus = settings.selected
  const { hintGap } = settingsConfig
  const labelWidth = section === 'hud' ? settingsConfig.labelWidth : Math.max(...rows.filter(row => !row.press).map(row => controlOf(row).label.length + labelEnd.length))
  const pointed = Math.max(0, rows.findIndex(row => row.key === focus))
  const checkHead = (label: string, size: number) => {
    const room = size - checkboxSize({ label: '' })
    if (room >= labelWidth) return `${label}${labelEnd}`.padEnd(labelWidth)
    return room > labelEnd.length + 1 ? `${cut(label, room - labelEnd.length)}${labelEnd}` : ''
  }
  const controlFace = ({ key, choice: control, toggle: check, press }: Row, size: number) => press
    ? Box({ key: `${key}-press`, flexShrink: 0, paddingLeft: labelWidth, children: button(ui, { key, label: press.label, selected: focus === key, width: Math.max(1, size - labelWidth), ...(press.inert || press.disabled ? { inert: true } : {}), onPress: press.onPress }) })
    : check
    ? Box({ key: `${key}-check`, flexDirection: 'row', flexShrink: 0, children: [
      ...[checkHead(check.label, size)].filter(Boolean).map(head => Text({ dimColor: !!check.disabled, children: head })),
      checkbox(ui, { key, label: '', checked: check.isOn, selected: focus === key, width: checkboxSize({ label: '' }), ...(check.disabled ? { disabled: true } : {}), onToggle: check.onToggle }),
    ] })
    : cycle(ui, { key, ...control, labelWidth, selected: focus === key, width: size, fit: true })
  const rowOf = (row: Row, at: number): StackRow[] => {
    const { key, choice: control, toggle: check, press, note } = row
    const priority = 1 + Math.abs(at - pointed)
    const size = Math.min(width, press ? labelWidth + buttonSize(press.label) : check ? labelWidth + checkboxSize({ label: '' }) : cycleSize({ ...control, labelWidth, fit: true }))
    const isBeside = note !== null && width - size - hintGap >= note.text.length
    const tail = note && isBeside ? Text({ ...(note.color ? { color: note.color } : { dimColor: true }), children: note.text }) : null
    const below = note && !isBeside
      ? paragraphRow(ui, { key: `${key}-note`, priority: priority + 2, minRows: 1, text: note.text, width: Math.max(1, width - labelWidth), rows: 2, ...(note.color ? { color: note.color } : { dim: true }) })
      : null
    return [
      {
        priority,
        rows: 1,
        ...(controlOf(row).disabled ? {} : { stop: key }),
        draw: () => Box({
          key: `${key}-line`,
          flexDirection: 'row',
          height: 1,
          flexShrink: 0,
          children: [controlFace(row, size), ...(tail ? [' '.repeat(hintGap), tail] : [])],
        }),
      },
      ...(below ? [{ ...below, draw: (given: number) => Box({ key: `${key}-note-line`, flexShrink: 0, paddingLeft: labelWidth, children: below.draw(given) }) }] : []),
    ]
  }
  const preview = section === 'hud' ? hudPreview(ui, settings, focus, width) : sectionPreview(ui, settings, width)
  const hasPreview = preview !== null && pane.rows >= 3 && (section === 'hud' || pane.rows > rows.length)
  const room = pane.rows - (hasPreview ? 1 : 0)
  const top = stack(ui, { rows: rows.flatMap(rowOf), room, width })
  const more = moreOf(stops.map(row => row.key), top.stops)
  const header = headerOf(focus, more)
  const body = Box({
    flexDirection: 'column',
    width,
    height: pane.rows,
    children: [
      ...(hasPreview && preview ? [preview, ...(top.rows < room ? [Box({ key: `${ROW}preview-gap`, height: 1, flexShrink: 0 })] : [])] : []),
      Box({ key: `${ROW}controls`, flexDirection: 'column', flexGrow: 1, flexShrink: 1, overflow: 'hidden', children: top.draw() }),
    ],
  })
  return pane.frame({ header, hint: helpOf(settings, focus), body })
}

async function moveSettings($: EngineInterface, settings: Settings, direction: Direction) {
  const step = stepOf(direction)
  const cell = settings.navigation.find(one => one.key === settings.selected)
  if (step && cell?.step) {
    cell.step(step)
    return
  }
  const key = gridMove(settings.navigation, settings.selected, direction)
  if (key !== settings.selected) await focusKey($, settings, key)
}

export const registerSettingsPane = (on: On, settings: Settings) => {
  const { id } = settingsConfig
  const guard = createMoveGuard()

  registerPanePress(on, settings.panes, settingsConfig, () => true)

  on('ui.scroll', { requestId: id }, async ($, e, next) => {
    if (!settings.visibility.isShown || e.origin.kind !== 'person') return next(e)
    const direction = scrollIntent(e)
    if (direction) await guard(() => moveSettings($, settings, direction))
    return {}
  })

  registerPaneClose(on, settings.panes, settingsConfig, {
    isOn: () => true,
    back: () => settings.section ? { run: () => leaveSection(settings) } : settings.isResetting ? { run: () => leaveReset(settings) } : null,
    closed: () => {
      hidePaneState(settings.visibility)
      settings.isResetting = false
      settings.generation += 1
    },
  })

  on('ui.focus', { requestId: id }, async ($, e, next) => {
    const generation = settings.generation
    const moved = await next(e)
    if (e.element && settings.navigation.some(cell => cell.key === e.element) && !moved.deny && generation === settings.generation) {
      settings.selected = e.element
      $.ui.invalidate('ui.render')
    }
    return moved
  })
}
