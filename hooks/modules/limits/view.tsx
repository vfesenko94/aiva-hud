import type { Color, RenderElement, SessionRateLimit, SessionUsage } from 'claude-code'

import { cut, duration, levelColor, meter, paragraphRow, paragraphRows, stack, timeOfDay, timeUnits } from '../../core'
import type { HudConfig, PaneZones, Segment, StackRow, Ui } from '../../core'
import { limitsConfig } from './config'
import { budgetOf, resetOf } from './pace'
import type { Budget } from './pace'
import type { Tracking } from './index'

type ViewProps = { usage: SessionUsage; tracking: Readonly<Tracking>; config: HudConfig; now: number; width: number; rows: number }

type Note = { text: string; color: Color | null; dim: boolean }

type Spec = (typeof limitsConfig.windows)[keyof typeof limitsConfig.windows]

type Thresholds = HudConfig['thresholds']

const { text, gap } = limitsConfig

const percentWidth = '100%'.length

const priorities = {
  head: [1, 4],
  bar: [2, 5],
  note: [3, 6],
  reset: [7, 8],
  between: 9,
  top: 10,
}

const moment = (at: number, now: number) => {
  const time = timeOfDay(at)
  return new Date(at).toDateString() === new Date(now).toDateString() ? time : `${limitsConfig.weekdays[new Date(at).getDay()]} ${time}`
}

const resetText = (resetAt: number | null, now: number) => {
  if (resetAt === null) return ''
  if (now >= resetAt) return `${text.resetAt}${moment(resetAt, now)}`
  return `${text.resetsIn}${duration(resetAt - now)} · ${moment(resetAt, now)}`
}

const ageText = (tracking: Readonly<Tracking>, now: number) => {
  if (tracking.seenAt === null) return ''
  const age = now - tracking.seenAt
  return age < timeUnits.minute ? `${text.updated}${text.justNow}` : `${text.updated}${duration(age)}${text.ago}`
}

const amount = (percent: number) => `${percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10}%`

const noteOf = (budget: Budget, now: number, thresholds: Thresholds): Note => {
  if (budget.kind === 'reset') return { text: text.waiting, color: null, dim: true }
  if (budget.kind === 'reached') return { text: text.reached, color: 'error', dim: false }
  if (budget.kind === 'early') return { text: `${text.forecastFrom}${moment(budget.from, now)}`, color: null, dim: true }
  if (budget.kind === 'left') return { text: `${budget.left}${text.left}${amount(budget.perDay)}${text.perDay}`, color: null, dim: false }
  return budget.isOver
    ? { text: text.forecastOver, color: 'error', dim: false }
    : { text: `${text.forecast}${budget.percent}${text.forecastUntil}`, color: levelColor(budget.percent, thresholds), dim: false }
}

const cellsOf = (percent: number, cells: number) => {
  const clamped = Math.max(0, Math.min(100, percent))
  return clamped > 0 ? Math.max(1, Math.round((clamped / 100) * cells)) : 0
}

const segmentsOf = (kind: string, used: number, forecast: number | null, cells: number, thresholds: Thresholds): Segment[] => {
  const lit = cellsOf(used, cells)
  const ahead = forecast === null ? 0 : Math.max(0, cellsOf(forecast, cells) - lit)
  return [
    { key: `limits-${kind}-used`, cells: lit, color: levelColor(used, thresholds) },
    { key: `limits-${kind}-forecast`, cells: ahead, color: levelColor(forecast ?? used, thresholds), dim: true },
    { key: `limits-${kind}-free`, cells: cells - lit - ahead, color: 'inactive', glyph: 'track' as const },
  ].filter(segment => segment.cells > 0)
}

const line = ({ Box }: Ui, key: string, children: RenderElement | RenderElement[]) => (
  <Box key={key} height={1} flexShrink={0}>
    {children}
  </Box>
)

const blank = ({ Box }: Ui, key: string, priority: number): StackRow => ({ priority, rows: 1, draw: () => <Box key={key} height={1} flexShrink={0} /> })

const noteRow = (ui: Ui, key: string, note: Note, width: number, priority: number): StackRow => {
  const { Box, Text } = ui
  return {
    priority,
    rows: paragraphRows({ text: note.text, width, rows: limitsConfig.noteRows }),
    minRows: 1,
    draw: height => (
      <Box key={key} width={width} height={height} flexShrink={0} overflow="hidden">
        <Text wrap="wrap" {...(note.color ? { color: note.color } : {})} dimColor={note.dim}>{note.text}</Text>
      </Box>
    ),
  }
}

const cardRows = (ui: Ui, limit: SessionRateLimit, spec: Spec, at: number, props: ViewProps): StackRow[] => {
  const { Text } = ui
  const { now, width, tracking, config } = props
  const { thresholds } = config
  const key = `limits-${limit.kind}`
  const resetAt = resetOf(limit)
  const isVoid = resetAt !== null && now >= resetAt
  const reset = resetText(resetAt, now)
  const title = cut(spec.title, width)
  const isSplit = reset !== '' && title.length + gap.length + reset.length > width
  const percent = (isVoid ? limitsConfig.missing : `${limit.percentUsed}%`).padStart(percentWidth)
  const cells = width - gap.length - percent.length
  const hasBar = cells >= limitsConfig.minBar
  const budget = budgetOf(limit, spec, now, tracking.seenAt)
  const forecast = budget?.kind === 'forecast' ? budget.percent : null
  const pick = (list: readonly number[]) => list[at] ?? priorities.top

  const rows: StackRow[] = [{
    priority: pick(priorities.head),
    rows: 1,
    draw: () => line(ui, `${key}-head`, [
      <Text bold>{title}</Text>,
      ...(isSplit || !reset ? [] : [<Text dimColor>{reset.padStart(width - title.length)}</Text>]),
    ]),
  }]
  if (isSplit) rows.push({ priority: pick(priorities.reset), rows: 1, draw: () => line(ui, `${key}-reset`, <Text dimColor>{cut(reset, width)}</Text>) })
  rows.push({
    priority: pick(priorities.bar),
    rows: 1,
    draw: () => line(ui, `${key}-bar`, [
      ...(hasBar ? meter(ui, segmentsOf(limit.kind, isVoid ? 0 : limit.percentUsed, forecast, cells, thresholds)) : []),
      <Text bold color={isVoid ? 'inactive' : levelColor(limit.percentUsed, thresholds)}>{`${hasBar ? gap : ''}${percent}`}</Text>,
    ]),
  })
  if (budget) rows.push(noteRow(ui, `${key}-note`, noteOf(budget, now, thresholds), width, pick(priorities.note)))
  return rows
}

const header = ({ Text }: Ui, props: ViewProps): RenderElement => {
  const title = cut(limitsConfig.title, props.width)
  const age = ageText(props.tracking, props.now)
  const fits = age !== '' && props.width - title.length - gap.length >= age.length
  return (
    <Text>
      <Text bold>{title}</Text>
      {fits ? <Text dimColor>{age.padStart(props.width - title.length)}</Text> : null}
    </Text>
  )
}

export const limitsView = (ui: Ui, props: ViewProps): PaneZones => {
  const { usage, width, rows } = props
  const cards = Object.values(limitsConfig.windows).flatMap(spec => {
    const limit = usage.rateLimits.find(one => one.kind === spec.kind)
    return limit ? [{ limit, spec }] : []
  })
  const all: StackRow[] = [blank(ui, 'limits-top', priorities.top)]
  if (cards.length === 0) all.push(paragraphRow(ui, { key: 'limits-empty', priority: 1, text: text.empty, width, rows: limitsConfig.noteRows, dim: true, minRows: 1 }))
  cards.forEach(({ limit, spec }, at) => {
    if (at > 0) all.push(blank(ui, `limits-between-${at}`, priorities.between))
    all.push(...cardRows(ui, limit, spec, at, props))
  })

  return {
    header: header(ui, props),
    hint: limitsConfig.hint,
    body: stack(ui, { rows: all, room: rows }).draw(),
  }
}
