import { create } from 'zustand'
import { z } from 'zod'

export const environmentLevelSchema = z.enum(['safe', 'caution', 'unsafe'])

export type EnvironmentLevel = z.infer<typeof environmentLevelSchema>

const environmentZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  lon: z.number(),
  lat: z.number(),
  radius_km: z.number(),
  elevation_m: z.number(),
  science_value: z.enum(['high', 'medium', 'low']),
  scenic: z.string(),
  classification: environmentLevelSchema,
  weather: z.object({
    classification: environmentLevelSchema,
    dust_index: z.number(),
    min_temp_c: z.number(),
    max_temp_c: z.number(),
    note: z.string(),
  }),
  radiation: z.object({
    classification: environmentLevelSchema,
    surface_dose_msv_day: z.number(),
    note: z.string(),
  }),
  basis: z.string(),
  source_url: z.string(),
  note: z.string(),
})

export type EnvironmentZone = z.infer<typeof environmentZoneSchema>

export const environmentResponseSchema = z.object({
  zones: z.array(environmentZoneSchema),
  basis: z.string(),
  note: z.string(),
  radiation_source_url: z.string(),
  weather_source_url: z.string(),
})

type EnvironmentState = {
  zones: EnvironmentZone[]
  note: string
  radiationSourceUrl: string
  weatherSourceUrl: string
  loading: boolean
  error: string | null
  selectedId: string | null
  /** Whether the regional screening overlay is drawn on the globe. */
  visible: boolean
  load: (force?: boolean) => Promise<void>
  select: (id: string | null) => void
  toggleVisible: () => void
}

let inFlight: Promise<void> | null = null

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  zones: [],
  note: '',
  radiationSourceUrl: '',
  weatherSourceUrl: '',
  loading: false,
  error: null,
  selectedId: null,
  visible: true,
  load: (force = false) => {
    if (inFlight) return inFlight
    if (!force && get().zones.length) return Promise.resolve()
    set({ loading: true, error: null })
    inFlight = (async () => {
      try {
        const response = await fetch('/api/environment/zones')
        if (!response.ok) throw new Error(String(response.status))
        const data = environmentResponseSchema.parse(await response.json())
        set({
          zones: data.zones,
          note: data.note,
          radiationSourceUrl: data.radiation_source_url,
          weatherSourceUrl: data.weather_source_url,
          loading: false,
        })
      } catch (cause) {
        set({
          loading: false,
          error: cause instanceof Error ? cause.message : String(cause),
        })
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  },
  select: (selectedId) => set({ selectedId }),
  toggleVisible: () => set((state) => ({ visible: !state.visible })),
}))
