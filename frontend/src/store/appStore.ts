import { create } from 'zustand'
import { z } from 'zod'

export const routePointSchema = z.object({
  distance_km: z.number(),
  elevation_m: z.number().nullable(),
  grade_deg: z.number().nullable(),
})

export const dangerSchema = z.object({
  type: z.enum(['steep', 'rollover', 'cliff']),
  label: z.string(),
  lon: z.number(),
  lat: z.number(),
  distance_km: z.number(),
  span_km: z.number(),
  max_grade_deg: z.number(),
  over_limit: z.boolean(),
})

export type RouteDanger = z.infer<typeof dangerSchema>

const crewEstimateSchema = z.object({
  profile: z.object({ objective: z.string(), pace_m_s: z.number(), mobility_allowance_pct: z.number(), science_minutes: z.number(), reserve_minutes: z.number(), budget_hours: z.number(), high_physical_risk: z.boolean().optional(), strict_contamination: z.boolean().optional(), repetitive_work: z.boolean().optional() }),
  outbound_hours: z.number(), return_hours: z.number(), planned_hours: z.number(), budget_margin_hours: z.number(), within_budget: z.boolean(), note: z.string(),
})

export const hazardousRouteSchema = z.object({
  crew_estimate: crewEstimateSchema.nullable().optional(),
  distance_km: z.number(),
  ascent_m: z.number(),
  descent_m: z.number(),
  max_grade_deg: z.number(),
  mean_grade_deg: z.number(),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
  profile: z.array(routePointSchema),
  dangers: z.array(dangerSchema),
  note: z.string().optional(),
})

export type HazardousRouteData = z.infer<typeof hazardousRouteSchema>

export const routeSchema = z.object({
  crew_estimate: crewEstimateSchema.nullable().optional(),
  start: z.string(),
  end: z.string(),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
  profile: z.array(routePointSchema),
  slope_limit_deg: z.number(),
  slope_compliant: z.boolean(),
  distance_km: z.number(),
  ascent_m: z.number(),
  descent_m: z.number(),
  min_elevation_m: z.number().nullable(),
  max_elevation_m: z.number().nullable(),
  max_grade_deg: z.number(),
  mean_grade_deg: z.number(),
  eta_hours: z.number(),
  pace_m_s: z.number(),
  eta_note: z.string().optional(),
  note: z.string().optional(),
  hazard_count: z.number().optional(),
  hazard_note: z.string().optional(),
  dangers: z.array(dangerSchema).optional(),
  hazardous: hazardousRouteSchema.nullable().optional(),
  resolution_note: z.string().optional(),
  source_url: z.string().optional(),
  retrieved_at: z.string().optional(),
})

export type RouteData = z.infer<typeof routeSchema>

export const conditionsSchema = z.object({
  requested_location: z.string(),
  station_location: z.string(),
  is_nearest_station: z.boolean(),
  station: z.string(),
  sol: z.union([z.string(), z.number()]),
  terrestrial_date: z.string().optional(),
  season: z.string().optional(),
  min_temp_c: z.number().nullable(),
  max_temp_c: z.number().nullable(),
  min_ground_temp_c: z.number().nullable().optional(),
  max_ground_temp_c: z.number().nullable().optional(),
  pressure_pa: z.number().nullable(),
  atmo_opacity: z.string().optional(),
  uv_index: z.string().optional(),
  sunrise: z.string().optional(),
  sunset: z.string().optional(),
  distance_km: z.number().optional(),
  note: z.string().optional(),
  data_note: z.string().optional(),
  source_url: z.string(),
  retrieved_at: z.string(),
})

export type ConditionsData = z.infer<typeof conditionsSchema>

export const hazardSchema = z.object({
  label: z.string(),
  detail: z.string(),
  source_url: z.string(),
})

export const scienceTargetSchema = z.object({
  name: z.string(),
  kind: z.string(),
  note: z.string(),
  source_url: z.string(),
})

export const landingSchema = z.object({
  name: z.string(),
  lon: z.number(),
  lat: z.number(),
  source_url: z.string(),
})

export const briefingSchema = z.object({
  location: z.string(),
  region: z.string(),
  lon: z.number(),
  lat: z.number(),
  headline: z.string(),
  summary: z.string(),
  why_it_matters: z.array(z.string()),
  hazards: z.array(hazardSchema),
  science_targets: z.array(scienceTargetSchema),
  landing: landingSchema.nullable().optional(),
  source_url: z.string(),
  data_quality: z.string(),
  retrieved_at: z.string(),
})

export type BriefingData = z.infer<typeof briefingSchema>

/**
 * Route lifecycle: idle (no route) → preview (scrubbable traverse preview)
 * → simulating (chase-camera scout animation) → back to preview.
 */
export type RoutePhase = 'idle' | 'preview' | 'simulating'

/** Which traverse the preview scrubber and scout simulation follow. */
export type RouteChoice = 'safe' | 'hazardous'

type AppState = {
  route: RouteData | null
  routePhase: RoutePhase
  routeChoice: RouteChoice
  /** Fraction (0-1) of the route distance the preview scrubber sits at. */
  previewT: number
  conditions: ConditionsData | null
  briefing: BriefingData | null
  setRoute: (route: RouteData | null) => void
  setPreviewT: (t: number) => void
  setRoutePhase: (phase: RoutePhase) => void
  setRouteChoice: (choice: RouteChoice) => void
  setConditions: (conditions: ConditionsData | null) => void
  setBriefing: (briefing: BriefingData | null) => void
  clearSite: () => void
}

export const useAppStore = create<AppState>((set) => ({
  route: null,
  routePhase: 'idle',
  routeChoice: 'safe',
  previewT: 0,
  conditions: null,
  briefing: null,
  setRoute: (route) =>
    set({
      route,
      routePhase: route ? 'preview' : 'idle',
      routeChoice: 'safe',
      previewT: 0,
    }),
  setPreviewT: (t) => set({ previewT: Math.min(1, Math.max(0, t)) }),
  setRoutePhase: (routePhase) => set({ routePhase }),
  setRouteChoice: (routeChoice) => set({ routeChoice, previewT: 0 }),
  setConditions: (conditions) => set({ conditions }),
  setBriefing: (briefing) => set({ briefing }),
  clearSite: () =>
    set({
      route: null,
      routePhase: 'idle',
      previewT: 0,
      conditions: null,
      briefing: null,
    }),
}))
