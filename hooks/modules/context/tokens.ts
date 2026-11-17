import type { ContextCategory } from 'claude-code'

import { contextConfig } from './config'

export const formatTokens = (n: number) => {
  const abs = Math.abs(n)

  return abs >= 999_500 ? `${+(n / 1_000_000).toFixed(1)}M` : abs >= 9_950 ? `${Math.round(n / 1000)}k` : `${+(n / 1000).toFixed(1)}k`
}

export const signedTokens = (n: number) => (n >= 0 ? `+${formatTokens(n)}` : formatTokens(n))

export const estimateTokens = (text: string) => Math.ceil(text.length / contextConfig.charsPerToken)

export const sumOf = (list: readonly number[]) => list.reduce((sum, n) => sum + n, 0)

export const isMessagesCategory = (category: Pick<ContextCategory, 'name'>) => contextConfig.patterns.messagesCategory.test(category.name)
