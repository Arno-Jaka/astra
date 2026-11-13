import type { EnvironmentLevel } from './environmentStore'

/** Entity-id prefix for the regional screening overlay. */
export const ENVIRONMENT_ENTITY_PREFIX = 'astra-environment-'

/** Shared legend metadata so the panel, layer swatches and map agree. */
export const ENVIRONMENT_LEVELS: EnvironmentLevel[] = ['safe', 'caution', 'unsafe']

export const ENVIRONMENT_COLORS: Record<EnvironmentLevel, string> = {
  safe: '#34d399',
  caution: '#fbbf24',
  unsafe: '#f87171',
}

export const ENVIRONMENT_LABELS: Record<EnvironmentLevel, string> = {
  safe: 'Safe',
  caution: 'Caution',
  unsafe: 'Unsafe',
}

/** Tailwind classes for a small classification chip. */
export const ENVIRONMENT_CHIP: Record<EnvironmentLevel, string> = {
  safe: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  caution: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  unsafe: 'border-red-400/40 bg-red-400/10 text-red-200',
}
