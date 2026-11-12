import { create } from 'zustand'

export type CrewProfile = {
  objective: string; pace_m_s: number; mobility_allowance_pct: number
  science_minutes: number; reserve_minutes: number; budget_hours: number
}
export const useMissionStore = create<{
  crew: CrewProfile; slopeLimit: number
  update: (key: keyof CrewProfile, value: number | string) => void
  setSlopeLimit: (value: number) => void
}>(set => ({
  crew: { objective: 'Investigate boxwork ridges for evidence of ancient groundwater', pace_m_s: 0.5, mobility_allowance_pct: 50, science_minutes: 45, reserve_minutes: 60, budget_hours: 6 },
  slopeLimit: 15,
  update: (key, value) => set(state => ({ crew: { ...state.crew, [key]: value } })),
  setSlopeLimit: slopeLimit => set({ slopeLimit }),
}))
