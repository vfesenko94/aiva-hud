import type { EngineInterface } from 'claude-code'

const trimmed = (path: string) => path.replace(/[\\/]+$/, '')

export async function configFolder($: EngineInterface) {
  const configured = await $.env.get('CLAUDE_CONFIG_DIR')
  if (configured) return trimmed(configured)
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return home ? `${trimmed(home)}/.claude` : null
}
