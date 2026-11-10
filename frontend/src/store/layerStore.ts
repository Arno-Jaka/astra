import { create } from 'zustand'

export type BaseLayerId = 'mola-hillshade' | 'viking'

type LayerState = {
  base: BaseLayerId
  slope: boolean
  setBase: (base: BaseLayerId) => void
  toggleSlope: () => void
}

export const useLayerStore = create<LayerState>((set) => ({
  base: 'mola-hillshade',
  slope: true,
  setBase: (base) => set({ base }),
  toggleSlope: () => set((state) => ({ slope: !state.slope })),
}))
