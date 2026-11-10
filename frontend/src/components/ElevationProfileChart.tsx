import type { RouteData } from '../store/appStore'

export default function ElevationProfileChart({ route }: { route: RouteData }) {
  const points = route.profile.flatMap((point) =>
    point.elevation_m === null
      ? []
      : [{ distance: point.distance_km, elevation: point.elevation_m }],
  )
  if (points.length < 2 || route.distance_km <= 0) return null

  const width = 340
  const height = 130
  const padX = 8
  const padTop = 10
  const padBottom = 20
  const minElevation = Math.min(...points.map((point) => point.elevation))
  const maxElevation = Math.max(...points.map((point) => point.elevation))
  const span = Math.max(maxElevation - minElevation, 1)
  const baseline = height - padBottom
  const x = (distance: number) =>
    padX + (distance / route.distance_km) * (width - padX * 2)
  const y = (elevation: number) =>
    baseline - ((elevation - minElevation) / span) * (height - padTop - padBottom)

  const line = points
    .map(
      (point) =>
        `${x(point.distance).toFixed(1)},${y(point.elevation).toFixed(1)}`,
    )
    .join(' ')
  const area = `${padX},${baseline} ${line} ${(width - padX).toFixed(1)},${baseline}`

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
        {route.distance_km.toFixed(0)} km
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
