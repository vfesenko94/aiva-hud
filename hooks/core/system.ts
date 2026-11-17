import type { EngineInterface } from 'claude-code'

export type System = 'windows' | 'mac' | 'wsl' | 'linux'

const known: { system: System | null } = { system: null }

async function detectSystem($: EngineInterface): Promise<System> {
  if ((await $.env.get('OS')) === 'Windows_NT') return 'windows'
  if (await $.env.get('WSL_DISTRO_NAME')) return 'wsl'
  const name = await $.process.run(['uname', '-s']).then(result => result.stdout.trim(), () => '')
  return name === 'Darwin' ? 'mac' : 'linux'
}

export async function systemOf($: EngineInterface): Promise<System> {
  known.system ??= await detectSystem($).catch((): System => 'linux')
  return known.system
}
