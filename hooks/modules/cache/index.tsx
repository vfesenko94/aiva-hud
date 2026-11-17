import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, ModelForkResult, ModelUsage, On, SessionEndInput, Timer } from 'claude-code'

import type { LastResponse, Ttl } from '../../../types'
import { cacheGlyph, checkboxGlyph, clock, isTtl, timeOfDay, timeUnits } from '../../core'
import type { CacheDisplay, CacheFormat, Keys } from '../../core'
import { cacheConfig } from './config'

export { cacheConfig } from './config'

const last = atom({ plugin: 'aiva-hud', key: 'last' } as const, null)
const learnedTtl = atom({ plugin: 'aiva-hud', key: 'learnedTtl' } as const, null)

type CacheExpiry = { expiresAt: number; ttl: Ttl; response: LastResponse }

type Warm = { isOn: boolean; pings: number; timer: Timer | null; generation: number }

export type Cache = { readonly ttl: Ttl | null; scope: number; readonly warm: Warm }

type TtlSources = { configured: Ttl | null; setting: Ttl | null; learned: Ttl | null; hasRateLimits: boolean }

export const createCache = (ttl: Ttl | null): Cache => ({ ttl, scope: 0, warm: { isOn: false, pings: 0, timer: null, generation: 0 } })

export const cacheScope = (cache: Cache) => {
  const scope = cache.scope

  return () => scope === cache.scope
}

const resetWarm = (warm: Warm) => {
  warm.generation += 1
  warm.timer?.cancel()
  Object.assign(warm, { isOn: false, pings: 0, timer: null })
}

export const endCacheSession = (cache: Cache, e: SessionEndInput) => {
  resetWarm(cache.warm)
  if (e.reason === 'clear' || e.reason === 'resume') cache.scope += 1
}

const observeTtl = (gap: number, usage: Pick<ModelUsage, 'cache_read_input_tokens'>): Ttl | null => {
  if (gap <= cacheConfig.ttlMs['5m'] + cacheConfig.learningGraceMs || gap >= cacheConfig.ttlMs['1h']) return null

  return usage.cache_read_input_tokens > 0 ? '1h' : '5m'
}

const selectTtl = ({ configured, setting, learned, hasRateLimits }: TtlSources): Ttl =>
  configured ?? setting ?? learned ?? (hasRateLimits ? '1h' : '5m')

const expiryOf = (response: LastResponse, ttl: Ttl): CacheExpiry => ({ expiresAt: response.at + cacheConfig.ttlMs[ttl], ttl, response })

export async function recordResponse($: EngineInterface, usage: LastResponse['usage'], isCurrent: () => boolean) {
  const at = await $.clock.now()
  if (!isCurrent()) return
  const previous = await read($, last)
  const seen = previous && observeTtl(at - previous.at, usage)
  if (!isCurrent()) return

  if (seen) await update($, learnedTtl, value => (isCurrent() ? seen : value))
  await update($, last, value => (isCurrent() ? { at, usage: { ...usage } } : value))
}

export const releaseCache = (cache: Cache) => {
  resetWarm(cache.warm)
  cache.scope += 1
}

export async function forgetCache($: EngineInterface, isOff: () => boolean) {
  await update($, last, value => (isOff() ? null : value))
  await update($, learnedTtl, value => (isOff() ? null : value))
}

export function stopWarm($: EngineInterface, cache: Cache, reason?: string) {
  if (!cache.warm.isOn) return
  resetWarm(cache.warm)
  if (reason) $.ui.toast(`Cache keep-warm stopped: ${reason}`)
  $.ui.invalidate('ui.render')
}

export function noteModelSwitch($: EngineInterface, cache: Cache, ttl: Ttl) {
  stopWarm($, cache, 'the model changed')
  const isCurrent = cacheScope(cache)
  update($, learnedTtl, value => (isCurrent() ? ttl : value)).catch(() => undefined)
}

async function readExpiry($: EngineInterface, configured: Ttl | null, hasRateLimits: boolean, isCurrent: () => boolean) {
  const response = await read($, last)
  if (!response || !isCurrent()) return null
  const setting = await $.settings.read({ key: 'promptCacheTtl' })
  if (!isCurrent()) return null
  const learned = await read($, learnedTtl)
  if (!isCurrent()) return null

  return expiryOf(response, selectTtl({ configured, setting: isTtl(setting) ? setting : null, learned, hasRateLimits }))
}

const contextOf = (usage: ModelUsage) => usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens

const failureOf = (reply: ModelForkResult) => {
  if (reply.isAnswered || reply.reason === 'empty-reply') return null
  if (reply.reason === 'nothing-to-fork') return 'nothing to keep warm yet'
  if (reply.reason === 'api-error') return `API error ${reply.status ?? ''} ${reply.error}`.replace(/\s+/g, ' ')
  return 'the keep-alive was cut off'
}

async function scheduleWarm($: EngineInterface, cache: Cache, isCurrent: () => boolean) {
  const { warm } = cacheConfig
  const usage = await $.session.usage()
  if (!isCurrent()) return
  const expiry = await readExpiry($, cache.ttl, usage.rateLimits.length > 0, isCurrent)
  const now = await $.clock.now()
  if (!isCurrent()) return
  if (!expiry) return stopWarm($, cache, 'no cached reply yet')
  if (expiry.ttl !== warm.ttl) return stopWarm($, cache, `it needs the ${warm.ttl} cache TTL, this session uses ${expiry.ttl}`)
  if (now >= expiry.expiresAt) return stopWarm($, cache, 'the cache has already expired')
  if (cache.warm.pings >= warm.maxPings) return stopWarm($, cache, `${warm.maxPings} keep-alives in a row`)

  cache.warm.timer = $.clock.after(Math.max(0, expiry.expiresAt - warm.leadMs - now), () => void pingWarm($, cache, expiry, isCurrent))
}

async function pingWarm($: EngineInterface, cache: Cache, expiry: CacheExpiry, isCurrent: () => boolean) {
  if (!isCurrent()) return
  cache.warm.timer = null
  const now = await $.clock.now()
  if (!isCurrent()) return
  if (now >= expiry.expiresAt) return stopWarm($, cache, 'the cache expired before the keep-alive ran')

  const reply = await $.model.fork({ prompt: cacheConfig.warm.prompt })
  if (!isCurrent()) return
  const failure = failureOf(reply)
  if (failure !== null || !('usage' in reply)) return stopWarm($, cache, failure ?? 'no reply')
  const { usage } = reply
  $.ui.log(`cache keep-alive ${cache.warm.pings + 1}: read ${usage.cache_read_input_tokens}, written ${usage.cache_creation_input_tokens}, input ${usage.input_tokens}, output ${usage.output_tokens}`, { to: 'debug' })
  if (usage.cache_read_input_tokens < cacheConfig.warm.minReadShare * contextOf(expiry.response.usage)) return stopWarm($, cache, 'the cache was not read, so it is no longer warm')

  cache.warm.pings += 1
  await recordResponse($, { ...usage, model: expiry.response.usage.model }, isCurrent)
  if (!isCurrent()) return
  $.ui.invalidate('ui.render')
  await scheduleWarm($, cache, isCurrent)
}

function startWarm($: EngineInterface, cache: Cache) {
  const { warm, scope } = cache
  resetWarm(warm)
  warm.isOn = true
  const generation = warm.generation
  const isCurrent = () => warm.generation === generation && cache.scope === scope
  $.ui.invalidate('ui.render')
  scheduleWarm($, cache, isCurrent).catch(error => {
    if (isCurrent()) stopWarm($, cache, error instanceof Error ? error.message : String(error))
  })
}

const toggleWarm = ($: EngineInterface, cache: Cache) => (cache.warm.isOn ? stopWarm($, cache) : startWarm($, cache))

const countdownOf = (format: CacheFormat, left: number) => {
  const seconds = Math.max(0, Math.round(left / timeUnits.second))
  if (format === 'units') return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (format === 'minutes') return `${Math.ceil(seconds / 60)}m`
  return format === 'labeled' ? `cache ${clock(left)}` : clock(left)
}

export const registerCache = (on: On, cache: Cache, keys: Readonly<Keys>, isOn: () => boolean, displayOf: () => CacheDisplay) => {

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isOn()) return next(e)
    const isCurrent = cacheScope(cache)
    const rest = await next(e)
    if (!isCurrent() || e.props.hasSurvey || e.props.isWorking) return rest

    const usage = await $.session.usage()
    if (!isCurrent()) return rest
    const expiry = await readExpiry($, cache.ttl, usage.rateLimits.length > 0, isCurrent)
    if (!expiry) return rest
    const now = await $.clock.now()
    if (!isCurrent()) return rest

    const { Box, Button, Text } = $.ui.resolve(e)
    const { expiresAt } = expiry
    const left = expiresAt - now
    const color: Color = left <= 0 ? 'error' : left < cacheConfig.expiryWarningMs ? 'warning' : 'success'
    const { format, until } = displayOf()
    const { warm } = cacheConfig
    const isWarm = cache.warm.isOn
    const hasWarm = expiry.ttl === warm.ttl && (isWarm || left > 0)
    const chord = keys.chords.warm
    const timer = left > 0 ? `${cacheGlyph} ${countdownOf(format, left)}` : `${cacheGlyph} cache cold`
    const since = until ? ` (${left > 0 ? 'until' : 'since'} ${timeOfDay(expiresAt)})` : ''
    const face = `${checkboxGlyph(isWarm)} ${warm.label}`
    const hint = chord ? `${warm.chordGap}${chord}` : ''
    const isHintShown = hint !== '' && timer.length + since.length + warm.gap.length + face.length + hint.length <= e.props.bodyColumns
    const toggle = () => toggleWarm($, cache)

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color={color}>
            {timer}
          </Text>
          {since ? <Text dimColor>{since}</Text> : null}
          {hasWarm ? <Text>{warm.gap}</Text> : null}
          {hasWarm ? (
            <Button key="cache-warm" plain action={warm.action} onPress={toggle}>
              <Text>
                <Text bold={isWarm} dimColor={!isWarm} {...(isWarm ? { color: warm.color } : {})}>
                  {face}
                </Text>
                {isHintShown ? <Text dimColor>{hint}</Text> : null}
              </Text>
            </Button>
          ) : null}
        </Box>
        {rest}
      </Box>
    )
  })
}
