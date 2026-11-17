import type { EngineInterface, ModelUsage, Next, On, PromptSubmitInput, SessionCompactInput, SessionEndInput, SessionUsage, ToolCallInput, ToolDescribeInput, ToolDescribeResult, TurnCompleteInput, TurnStartInput, TurnStepInput, UiPane } from 'claude-code'

import { center, levelColor } from '../../core'
import type { Block, ContextFormat, Display, HudConfig, Live, Panes, Ui } from '../../core'
import { contextConfig } from './config'
import { formatTokens } from './tokens'
import { beginHistoryStep, compactHistory, completeHistoryTurn, createHistory, endHistorySession, noteSubmit, pruneHistory, recordHistoryStep, releaseHistory, scopeGuard, startHistoryTurn, trackHistoryTool } from './history'
import type { History } from './history'
import { activatePane, closePane, createPane, forgetSources, notePane, noteTool, registerPane, showPane } from './pane'
import type { Pane } from './pane'

export type Context = { readonly config: HudConfig; readonly history: History; readonly pane: Pane }

export const createContext = (config: HudConfig, panes: Panes, live: Readonly<Live>): Context => {
  const history = createHistory(live)

  return { config, history, pane: createPane({ history, panes }) }
}

export const registerContext = (on: On, context: Context, isOn: () => boolean) => {
  registerPane(on, context.pane, isOn)
}

export const contextScope = (context: Context) => scopeGuard(context.history)

export const isContextShown = (context: Context) => context.pane.visibility.isShown

export const noteContextSubmit = (context: Context, e: PromptSubmitInput) => noteSubmit(context.history, e)

export const noteContextTool = (context: Context, e: ToolDescribeInput, described: ToolDescribeResult) => noteTool(context.pane, e, described)

export function startContextSession($: EngineInterface, context: Context) {
  return pruneHistory($, context.history)
}

export function endContextSession($: EngineInterface, context: Context, e: SessionEndInput) {
  return endHistorySession($, context.history, e)
}

export function startContextTurn($: EngineInterface, context: Context, e: TurnStartInput) {
  return startHistoryTurn($, context.history, e)
}

export function trackContextTool($: EngineInterface, context: Context, e: ToolCallInput, next: Next<'tool.call'>) {
  return trackHistoryTool($, context.history, e, next)
}

export function completeContextTurn($: EngineInterface, context: Context, e: TurnCompleteInput) {
  return completeHistoryTurn($, context.history, e)
}

export function compactContext($: EngineInterface, context: Context, e: SessionCompactInput, next: Next<'session.compact'>) {
  return compactHistory($, context.history, e, next)
}

export function beginContextStep($: EngineInterface, context: Context, e: TurnStepInput) {
  return beginHistoryStep($, context.history, e)
}

export function recordContextStep($: EngineInterface, context: Context, e: TurnStepInput, usage: ModelUsage, answer: string) {
  return recordHistoryStep($, context.history, e, usage, answer)
}

export function showContext($: EngineInterface, context: Context) {
  return showPane($, context.pane)
}

export function closeContext($: EngineInterface, context: Context) {
  return closePane($, context.pane)
}

export function activateContext($: EngineInterface, context: Context) {
  return activatePane($, context.pane)
}

export async function contextBlock($: EngineInterface, context: Context, { Text }: Ui, usage: SessionUsage, display: Display<ContextFormat>, panes: readonly UiPane[]): Promise<Block> {
  const { pane, config } = context
  notePane(pane, panes)
  const isShown = pane.visibility.isShown
  const tokens = usage.context.tokens ?? 0
  const window = usage.context.window || contextConfig.fallbackWindow
  const percent = usage.context.percent ?? Math.round((tokens / window) * 100)
  const textOf = (format: ContextFormat) => {
    const reading = format === 'used' ? formatTokens(tokens) : format === 'percent' ? `${percent}%` : `${formatTokens(tokens)}/${formatTokens(window)}`
    return isShown ? `[${reading}]` : reading
  }
  const text = textOf(display.format)
  const alternate = display.hover ? textOf(display.hover) : null
  const room = Math.max(text.length, alternate?.length ?? 0)
  const color = levelColor(percent, config.thresholds)

  return {
    id: 'context',
    isPressable: true,
    action: contextConfig.toggleAction,
    label: <Text color={color}>{center(text, room)}</Text>,
    overlay: alternate !== null && (
      <Text inverse color={color}>
        {center(alternate, room)}
      </Text>
    ),
  }
}

export const releaseContext = (context: Context) => {
  releaseHistory(context.history)
  forgetSources(context.pane)
}
