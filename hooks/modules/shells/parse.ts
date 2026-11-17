import { hintParts, joinHint } from '../../core'
import { shellsConfig } from './config'

type ParsedShells = { hint: string; shells: number; isShellSelected: boolean }

export const parseShells = (hint: string): ParsedShells => {
  const parts = hintParts(hint)

  return {
    hint: joinHint(parts.filter(part => !shellsConfig.count.test(part) && !shellsConfig.selected.test(part))),
    shells: Number(parts.map(part => part.match(shellsConfig.count)?.[1]).find(Boolean) ?? 0),
    isShellSelected: parts.some(part => shellsConfig.selected.test(part)),
  }
}
