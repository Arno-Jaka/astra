import { sampleRoute } from '../map/routePath'
import type { TraversableRoute } from '../map/routePath'
import type { RouteDanger } from '../store/appStore'

/** Danger-zone band tint on the elevation profile, by severity. */
const DANGER_FILL: Record<RouteDanger['type'], string> = {
  steep: 'rgba(250, 204, 21, 0.14)',
  rollover: 'rgba(249, 115, 22, 0.20)',
  cliff: 'rgba(239, 68, 68, 0.26)',
}

export default function ElevationProfileChart({
  traverse,
  dangers = [],
  previewT = 0,
}: {
  traverse: TraversableRoute
  dangers?: RouteDanger[]
  previewT?: number
}) {
  const points = traverse.profile.flatMap((point) =>
    point.elevation_m === null
      ? []
      : [{ distance: point.distance_km, elevation: point.elevation_m }],
  )
  const totalKm = traverse.profile[traverse.profile.length - 1]?.distance_km ?? 0
  if (points.length < 2 || totalKm <= 0) return null

  const width = 340
  const height = 130
  const padX = 8
  const padTop = 10
  const padBottom = 20
  const minElevation = Math.min(...points.map((point) => point.elevation))
  const maxElevation = Math.max(...points.map((point) => point.elevation))
  const span = Math.max(maxElevation - minElevation, 1)
  const baseline = height - padBottom
  const x = (distance: number) => padX + (distance / totalKm) * (width - padX * 2)
  const y = (elevation: number) =>
    baseline - ((elevation - minElevation) / span) * (height - padTop - padBottom)

  const line = points
    .map(
      (point) =>
        `${x(point.distance).toFixed(1)},${y(point.elevation).toFixed(1)}`,
    )
    .join(' ')
  const area = `${padX},${baseline} ${line} ${(width - padX).toFixed(1)},${baseline}`

  const sample = sampleRoute(traverse, previewT)
  const scrubX = x(sample.distanceKm)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-32 w-full"
      role="img"
      aria-label="Elevation profile"
    >
      <defs>
        <linearGradient id="astra-elevation" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff8a3d" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ff8a3d" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((fraction) => {
        const gridY = padTop + fraction * (height - padTop - padBottom)
        return (
          <line
            key={fraction}
            x1={padX}
            x2={width - padX}
            y1={gridY}
            y2={gridY}
            stroke="rgba(255,255,255,0.08)"
          />
        )
      })}
      {dangers.map((zone) => {
        const start = Math.max(0, zone.distance_km - zone.span_km / 2)
        const end = Math.min(totalKm, zone.distance_km + zone.span_km / 2)
        if (end <= start) return null
        return (
          <rect
            key={`${zone.type}-${zone.distance_km}`}
            x={x(start)}
            width={Math.max(x(end) - x(start), 2)}
            y={padTop}
            height={baseline - padTop}
            fill={DANGER_FILL[zone.type]}
          />
        )
      })}
      <polygon points={area} fill="url(#astra-elevation)" />
      <polyline
        points={line}
        fill="none"
        stroke="#ff8a3d"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={x(points[0].distance)}
        cy={y(points[0].elevation)}
        r={2.5}
        fill="#a3e635"
      />
      <circle
        cx={x(points[points.length - 1].distance)}
        cy={y(points[points.length - 1].elevation)}
        r={2.5}
        fill="#fb923c"
      />
      <g>
        <line
          x1={scrubX}
          x2={scrubX}
          y1={padTop}
          y2={baseline}
          stroke="#22d3ee"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <circle cx={scrubX} cy={y(sample.elevationM)} r={3} fill="#22d3ee" />
      </g>
      <text x={padX} y={height - 5} fill="rgba(255,255,255,0.45)" fontSize={9}>
        0 km
      </text>
      <text
        x={width - padX}
        y={height - 5}
        textAnchor="end"
        fill="rgba(255,255,255,0.45)"
        fontSize={9}
      >
        {totalKm.toFixed(0)} km
      </text>
      <text
        x={padX}
        y={y(minElevation) - 3}
        fill="rgba(255,255,255,0.45)"
        fontSize={9}
      >
        {Math.round(minElevation)} m
      </text>
      <text
        x={padX}
        y={y(maxElevation) + 9}
        fill="rgba(255,255,255,0.45)"
        fontSize={9}
      >
        {Math.round(maxElevation)} m
      </text>
    </svg>
  )
}
