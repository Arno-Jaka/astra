import { create } from 'zustand'
import { z } from 'zod'

export const routePointSchema = z.object({
  distance_km: z.number(),
  elevation_m: z.number().nullable(),
  grade_deg: z.number().nullable(),
})

export const routeSchema = z.object({
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

type AppState = {
  route: RouteData | null
  conditions: ConditionsData | null
  briefing: BriefingData | null
  setRoute: (route: RouteData | null) => void
  setConditions: (conditions: ConditionsData | null) => void
  setBriefing: (briefing: BriefingData | null) => void
  clearSite: () => void
}

export const useAppStore = create<AppState>((set) => ({
  route: null,
  conditions: null,
  briefing: null,
  setRoute: (route) => set({ route }),
  setConditions: (conditions) => set({ conditions }),
  setBriefing: (briefing) => set({ briefing }),
  clearSite: () => set({ route: null, conditions: null, briefing: null }),
}))
