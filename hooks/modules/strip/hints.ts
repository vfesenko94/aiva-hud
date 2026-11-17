import { hintParts, joinHint } from '../../core'
import type { HintKey } from '../../core'
import { stripConfig } from './config'

export const cleanHint = (hint: string, isShown: (key: HintKey) => boolean) => {
  const hidden = (Object.keys(stripConfig.hints) as HintKey[]).filter(key => !isShown(key)).map(key => stripConfig.hints[key])
  if (!hidden.length) return hint
  return joinHint(hintParts(hint).map(part => hidden.reduce((text, pattern) => text.replace(pattern, '').trim(), part)))
}
