import { create } from 'zustand'

export type CrewProfile = {
  objective: string; pace_m_s: number; mobility_allowance_pct: number
  science_minutes: number; reserve_minutes: number; budget_hours: number
  high_physical_risk: boolean; strict_contamination: boolean; repetitive_work: boolean
}
export const useMissionStore = create<{
  crew: CrewProfile; slopeLimit: number
  update: (key: keyof CrewProfile, value: number | string | boolean) => void
  setSlopeLimit: (value: number) => void
}>(set => ({
  crew: { objective: 'Investigate boxwork ridges for evidence of ancient groundwater', pace_m_s: 0.5, mobility_allowance_pct: 50, science_minutes: 45, reserve_minutes: 60, budget_hours: 6, high_physical_risk: false, strict_contamination: false, repetitive_work: false },
  slopeLimit: 15,
  update: (key, value) => set(state => ({ crew: { ...state.crew, [key]: value } })),
  setSlopeLimit: slopeLimit => set({ slopeLimit }),
}))
