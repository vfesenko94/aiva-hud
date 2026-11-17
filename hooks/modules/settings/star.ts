import type { EngineInterface } from 'claude-code'

import { systemOf } from '../../core'
import { settingsConfig } from './config'

export type Star = { isHidden: boolean; isChecked: boolean; isBusy: boolean; thanks: string | null }

const { repo, storeKey, texts } = settingsConfig.star

const url = `https://github.com/${repo}`

const starPath = `user/starred/${repo}`

export const createStar = (): Star => ({ isHidden: true, isChecked: false, isBusy: false, thanks: null })

export const isStarAsked = (star: Star) => !star.isHidden || star.thanks !== null

async function exitOf($: EngineInterface, argv: readonly string[]) {
  return $.process.run(argv).then(result => result.exitCode, () => null)
}

async function hideStar($: EngineInterface, star: Star) {
  star.isHidden = true
  $.ui.invalidate('ui.render')
  await $.store.set(storeKey, { isHidden: true }).catch(() => undefined)
}

export async function loadStar($: EngineInterface, star: Star) {
  const saved: unknown = await $.store.get(storeKey).catch(() => undefined)
  star.isHidden = !!saved && typeof saved === 'object' && (saved as Record<string, unknown>).isHidden === true
}

export async function checkStar($: EngineInterface, star: Star) {
  if (star.isHidden || star.isChecked) return
  star.isChecked = true
  if ((await exitOf($, ['gh', 'api', starPath, '--silent'])) === 0) await hideStar($, star)
}

async function openUrl($: EngineInterface) {
  const system = await systemOf($)
  if (system === 'windows') return (await exitOf($, ['rundll32', 'url.dll,FileProtocolHandler', url])) === 0
  if (system === 'wsl') return (await exitOf($, ['wslview', url])) === 0 || (await exitOf($, ['explorer.exe', url])) !== null
  return (await exitOf($, [system === 'mac' ? 'open' : 'xdg-open', url])) === 0
}

async function copyUrl($: EngineInterface) {
  return $.ui.copy({ text: url }).then(result => result.isCopied, () => false)
}

async function thanksOf($: EngineInterface) {
  if ((await exitOf($, ['gh', 'api', '--method', 'PUT', starPath, '--silent'])) === 0) return texts.starred
  if (await openUrl($)) return texts.opened
  return `${(await copyUrl($)) ? texts.copied : texts.manual}${url}`
}

export async function giveStar($: EngineInterface, star: Star) {
  if (star.isBusy) return
  star.isBusy = true
  $.ui.invalidate('ui.render')
  star.thanks = await thanksOf($)
  star.isBusy = false
  await hideStar($, star)
}

export function dismissStar($: EngineInterface, star: Star) {
  return hideStar($, star)
}
