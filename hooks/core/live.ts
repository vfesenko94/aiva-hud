import type { EngineInterface, TurnCompleteInput, TurnStartInput } from 'claude-code'

export type Live = { isWorking: boolean; turnId: string | null }

export const createLive = (): Live => ({ isWorking: false, turnId: null })

function changeLive($: EngineInterface, live: Live, next: Live) {
  if (live.isWorking === next.isWorking && live.turnId === next.turnId) return
  Object.assign(live, next)
  $.ui.invalidate('ui.render')
}

export function startLiveTurn($: EngineInterface, live: Live, e: TurnStartInput) {
  if (!e.agentId) changeLive($, live, { isWorking: true, turnId: e.turnId })
}

export function completeLiveTurn($: EngineInterface, live: Live, e: TurnCompleteInput) {
  if (!e.agentId && (live.turnId === null || live.turnId === e.turnId)) changeLive($, live, createLive())
}

export function resetLive($: EngineInterface, live: Live) {
  changeLive($, live, createLive())
}
