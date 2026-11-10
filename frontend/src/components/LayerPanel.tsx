import { useLayerStore, type BaseLayerId } from '../store/layerStore'

const BASES: { id: BaseLayerId; label: string; note: string }[] = [
  {
    id: 'mola-hillshade',
    label: 'MOLA hillshade',
    note: 'Topographic · MGS MOLA',
  },
  {
    id: 'viking',
    label: 'Viking MDIM 2.1',
    note: 'Optical · Viking orbiter',
  },
]

const SLOPE_SWATCHES = [
  { color: 'rgba(94, 213, 92, 0.55)', label: '5–10°' },
  { color: 'rgba(250, 204, 21, 0.6)', label: '10–15°' },
  { color: 'rgba(251, 146, 60, 0.65)', label: '15–25°' },
  { color: 'rgba(239, 68, 68, 0.7)', label: '>25°' },
]

export default function LayerPanel() {
  const base = useLayerStore((state) => state.base)
  const setBase = useLayerStore((state) => state.setBase)
  const slope = useLayerStore((state) => state.slope)
  const toggleSlope = useLayerStore((state) => state.toggleSlope)

  return (
    <aside className="pointer-events-auto absolute right-4 top-16 z-20 w-56 rounded-xl border border-white/10 bg-black/65 p-3 shadow-2xl backdrop-blur-xl">
      <p className="text-[10px] uppercase tracking-[0.22em] text-orange-300/80">
        Layers
      </p>

      <div className="mt-2 space-y-1">
        <p className="text-[9px] uppercase tracking-wider text-neutral-500">
          Base imagery
        </p>
        {BASES.map((layer) => (
          <label key={layer.id} className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name="astra-base-layer"
              checked={base === layer.id}
              onChange={() => setBase(layer.id)}
              className="mt-0.5 accent-orange-400"
            />
            <span className="leading-tight">
              <span className="block text-[11px] font-medium text-neutral-100">
                {layer.label}
              </span>
              <span className="block text-[9px] text-neutral-500">
                {layer.note}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-3 border-t border-white/10 pt-2">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={slope}
            onChange={toggleSlope}
            className="mt-0.5 accent-orange-400"
          />
          <span className="leading-tight">
            <span className="block text-[11px] font-medium text-neutral-100">
              Slope hazard
            </span>
            <span className="block text-[9px] text-neutral-500">
              Derived from MOLA DEM · NASA PDS
            </span>
          </span>
        </label>
        {slope ? (
          <div className="mt-1.5 flex items-center gap-1 pl-6">
            {SLOPE_SWATCHES.map((swatch) => (
              <span key={swatch.label} className="flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-3.5 rounded-[2px]"
                  style={{ backgroundColor: swatch.color }}
                />
                <span className="text-[8px] text-neutral-500">
                  {swatch.label}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-[8px] leading-relaxed text-neutral-600">
        Imagery: NASA/JPL/USGS Mars Trek · NASA-only sources.
      </p>
    </aside>
  )
}
