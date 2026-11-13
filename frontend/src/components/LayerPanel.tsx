import { useEnvironmentStore } from '../store/environmentStore'
import { ENVIRONMENT_COLORS, ENVIRONMENT_LABELS, ENVIRONMENT_LEVELS } from '../store/environmentMeta'
import { useLayerStore, type BaseLayerId } from '../store/layerStore'
import FloatingPanel from './FloatingPanel'

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

export default function LayerPanel({ terrainStatus, onRetryTerrain }: {
  terrainStatus: 'loading' | 'ready' | 'fallback'; onRetryTerrain: () => void
}) {
  const base = useLayerStore((state) => state.base)
  const setBase = useLayerStore((state) => state.setBase)
  const slope = useLayerStore((state) => state.slope)
  const toggleSlope = useLayerStore((state) => state.toggleSlope)
  const environment = useEnvironmentStore((state) => state.visible)
  const toggleEnvironment = useEnvironmentStore((state) => state.toggleVisible)
  const loadEnvironment = useEnvironmentStore((state) => state.load)

  return (
    <FloatingPanel id="layers" title="Map layers" width={260} initial={{ right: 16, top: 16 }}>
    <aside className="p-3">
      {terrainStatus !== 'ready' ? <div role="status" className="mb-3 rounded border border-amber-300/30 bg-amber-400/10 p-2 text-xs text-amber-200">
        {terrainStatus === 'loading' ? 'Loading NASA elevation terrain…' : 'Elevation service unavailable. Showing an imagery-only Mars globe.'}
        {terrainStatus === 'fallback' ? <button type="button" className="mt-2 block rounded border border-amber-300/40 px-2 py-1" onClick={onRetryTerrain}>Retry terrain</button> : null}
      </div> : null}
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

      <div className="mt-3 border-t border-white/10 pt-2">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={environment}
            onChange={() => {
              if (!environment) void loadEnvironment()
              toggleEnvironment()
            }}
            className="mt-0.5 accent-orange-400"
          />
          <span className="leading-tight">
            <span className="block text-[11px] font-medium text-neutral-100">
              Weather &amp; radiation
            </span>
            <span className="block text-[9px] text-neutral-500">
              Regional screening · derived
            </span>
          </span>
        </label>
        {environment ? (
          <div className="mt-1.5 flex items-center gap-1.5 pl-6">
            {ENVIRONMENT_LEVELS.map((level) => (
              <span key={level} className="flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: ENVIRONMENT_COLORS[level] }}
                />
                <span className="text-[8px] text-neutral-500">
                  {ENVIRONMENT_LABELS[level]}
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
    </FloatingPanel>
  )
}
