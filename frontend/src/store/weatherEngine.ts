import type { EnvironmentLevel } from './environmentStore'

/** Illustrative surface-weather events. These are dramatic visualizations,
 * not forecasts: Mars has no liquid-rain weather as shown here. */
export type WeatherKind =
  | 'clear'
  | 'sandstorm'
  | 'dust-tornado'
  | 'electrostatic'
  | 'ice-squall'
  | 'ice-fog'

export type WeatherProfile = {
  label: string
  description: string
  /** What the event does to the on-screen crew and vehicles. */
  assetEffect: string
  durationS: number
  fadeInS: number
  fadeOutS: number
  /** Peak wind used for the asset lean, m/s (illustrative). */
  peakWindMps: number
  /** Peak dust index 0-1. */
  dustIndex: number
  /** Approximate visibility at peak, m (illustrative). */
  visibilityM: number
  precipitation: boolean
  vortex: boolean
  lightning: boolean
  fog: boolean
}

export const WEATHER_PROFILES: Record<WeatherKind, WeatherProfile> = {
  clear: {
    label: 'Clear · thin haze',
    description: 'No active weather cell; only the usual thin CO₂ haze.',
    assetEffect: 'No wind load on the crew or vehicles.',
    durationS: 14,
    fadeInS: 2,
    fadeOutS: 2,
    peakWindMps: 3,
    dustIndex: 0.12,
    visibilityM: 18_000,
    precipitation: false,
    vortex: false,
    lightning: false,
    fog: false,
  },
  sandstorm: {
    label: 'Regional sandstorm',
    description: 'A wall of wind-driven sand rakes the surface and swallows the horizon.',
    assetEffect: 'Crew lean into the gust; the rover rocks on its suspension and takes a dust tint.',
    durationS: 28,
    fadeInS: 5,
    fadeOutS: 6,
    peakWindMps: 34,
    dustIndex: 0.9,
    visibilityM: 180,
    precipitation: false,
    vortex: false,
    lightning: false,
    fog: false,
  },
  'dust-tornado': {
    label: 'Dust tornado',
    description: 'A spinning dust column tears across the surface, throwing grit and pebbles.',
    assetEffect: 'The column buffets the crew and rocks the rover with each passing gust.',
    durationS: 24,
    fadeInS: 4,
    fadeOutS: 5,
    peakWindMps: 42,
    dustIndex: 0.92,
    visibilityM: 320,
    precipitation: false,
    vortex: true,
    lightning: false,
    fog: false,
  },
  electrostatic: {
    label: 'Electrostatic dust storm',
    description: 'Charged dust and dry lightning crackle around anything metal.',
    assetEffect: 'Bright flashes wash over the crew and rover while grit streams past.',
    durationS: 26,
    fadeInS: 4,
    fadeOutS: 5,
    peakWindMps: 31,
    dustIndex: 0.82,
    visibilityM: 240,
    precipitation: false,
    vortex: false,
    lightning: true,
    fog: false,
  },
  'ice-squall': {
    label: 'CO₂ ice rain',
    description: 'A rare CO₂ ice squall: hard crystals streak down through the dust.',
    assetEffect: 'Ice streaks whip past; the crew shortens its stride and leans away.',
    durationS: 20,
    fadeInS: 4,
    fadeOutS: 4,
    peakWindMps: 16,
    dustIndex: 0.3,
    visibilityM: 1_100,
    precipitation: true,
    vortex: false,
    lightning: false,
    fog: false,
  },
  'ice-fog': {
    label: 'Ice fog',
    description: 'A low, cold fog pours across the ground and erases the horizon.',
    assetEffect: 'Visibility collapses; the crew slows and the rover appears wrapped in haze.',
    durationS: 18,
    fadeInS: 4,
    fadeOutS: 4,
    peakWindMps: 5,
    dustIndex: 0.18,
    visibilityM: 90,
    precipitation: false,
    vortex: false,
    lightning: false,
    fog: true,
  },
}

/** Entity ids for transient weather-only graphics (lightning bolts, vortex). */
export const WEATHER_ENTITY_PREFIX = 'astra-weather-'

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/**
 * Event envelope: ramps in, gust-pulses, then fades out. At the end of the
 * duration the intensity returns to zero so the next event starts cleanly.
 */
export function weatherIntensity(kind: WeatherKind, elapsedS: number): number {
  const profile = WEATHER_PROFILES[kind]
  if (kind === 'clear' || profile.durationS <= 0) return 0
  const t = clamp01(elapsedS / profile.durationS)
  const fadeIn = profile.fadeInS / profile.durationS
  const fadeOut = profile.fadeOutS / profile.durationS
  const envelope = t < fadeIn
    ? t / fadeIn
    : t > 1 - fadeOut
      ? (1 - t) / fadeOut
      : 1
  const gust = 0.72
    + 0.18 * Math.sin(elapsedS * 1.9)
    + 0.1 * Math.sin(elapsedS * 0.47 + 1.2)
  return clamp01(envelope * gust)
}

/** Illustrative wind speed for the current intensity (m/s). */
export function weatherWindMps(kind: WeatherKind, elapsedS: number): number {
  if (kind === 'clear') return WEATHER_PROFILES.clear.peakWindMps
  return WEATHER_PROFILES[kind].peakWindMps * weatherIntensity(kind, elapsedS)
}

/** Illustrative dust index 0-1 for the current intensity. */
export function weatherDustIndex(kind: WeatherKind, elapsedS: number): number {
  return WEATHER_PROFILES[kind].dustIndex * (kind === 'clear'
    ? 1
    : Math.max(0.25, weatherIntensity(kind, elapsedS)))
}

/** How far the crew and vehicles should lean in the wind (radians). */
export function weatherLeanRad(kind: WeatherKind, elapsedS: number): number {
  if (kind === 'clear') return 0
  const wind = weatherWindMps(kind, elapsedS)
  const gust = 0.78 + 0.22 * Math.sin(elapsedS * 2.1 + 0.6)
  return Math.min(0.095, (wind / 100) * 0.22) * gust
}

export type WeatherTint = {
  /** Linear-ish RGB in 0-1, applied to the crew/vehicle models. */
  color: readonly [number, number, number]
  /** How strongly to mix the colour over the asset (0 = unchanged). */
  amount: number
}

/** Dust/ice colour wash for the 3D assets and the screen overlay. */
export function weatherTint(kind: WeatherKind, elapsedS: number): WeatherTint {
  const intensity = weatherIntensity(kind, elapsedS)
  switch (kind) {
    case 'clear':
      return { color: [1, 1, 1], amount: 0 }
    case 'sandstorm':
    case 'dust-tornado':
      return { color: [0.72, 0.52, 0.33], amount: Math.min(0.55, 0.2 + 0.45 * intensity) }
    case 'electrostatic':
      return { color: [0.56, 0.5, 0.42], amount: Math.min(0.45, 0.16 + 0.35 * intensity) }
    case 'ice-squall':
    case 'ice-fog':
      return { color: [0.78, 0.9, 1], amount: Math.min(0.5, 0.18 + 0.4 * intensity) }
  }
}

/** Small deterministic PRNG so a region's weather sequence is reproducible. */
export function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0
}

function randomFromSeed(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Every event is purely visual and never gates traversal, so even safe regions
// can still see the full set of weather. Safe keeps a calmer weighting (more
// clear/ice, less storm) but no event is excluded; unsafe drops the calm gaps.
const EVENT_WEIGHTS: Record<EnvironmentLevel, Partial<Record<WeatherKind, number>>> = {
  safe: { clear: 3, 'ice-fog': 2, 'ice-squall': 2, 'dust-tornado': 2, sandstorm: 2, electrostatic: 1 },
  caution: { clear: 1, 'ice-fog': 1, 'ice-squall': 2, 'dust-tornado': 3, sandstorm: 2, electrostatic: 1 },
  unsafe: { sandstorm: 3, 'dust-tornado': 3, electrostatic: 3, 'ice-squall': 1 },
}

/** Pick the next event, biased by the selected region's screening class. */
export function pickWeather(classification: EnvironmentLevel, seed: number): WeatherKind {
  const weights = EVENT_WEIGHTS[classification]
  const entries = Object.entries(weights) as [WeatherKind, number][]
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = randomFromSeed(seed) * total
  for (const [kind, weight] of entries) {
    roll -= weight
    if (roll <= 0) return kind
  }
  return entries[entries.length - 1][0]
}
