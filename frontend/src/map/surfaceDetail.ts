/** Illustrative sub-MOLA relief; never used by the NASA route planner.
 * World-anchored, band-limited waves form shallow depressions and ridges.
 */
export function surfaceDetail(lon: number, lat: number, spacingM: number): number {
  if (spacingM >= 8) return 0
  const x = lon * 59238 * Math.cos(lat * Math.PI / 180)
  const y = lat * 59238
  const band = (wavelength: number, amplitude: number, angle: number) => {
    const fade = Math.max(0, Math.min(1, wavelength / spacingM / 4 - 1))
    const phase = (x * Math.cos(angle) + y * Math.sin(angle)) * 2 * Math.PI / wavelength
    return amplitude * fade * fade * (3 - 2 * fade) * Math.sin(phase)
  }
  const cellX = Math.floor(x / 32)
  const cellY = Math.floor(y / 32)
  const seed = Math.sin(cellX * 127.1 + cellY * 311.7) * 43758.5453
  const random = seed - Math.floor(seed)
  const radius = 1.5 + random * 2
  const dx = x - (cellX * 32 + 12 + random * 8)
  const dy = y - (cellY * 32 + 20 - random * 8)
  const r = Math.hypot(dx, dy) / radius
  const detailFade = Math.max(0, Math.min(1, radius / spacingM / 4 - 1))
  // Compact, smooth-edged potholes: zero displacement/gradient at the rim.
  const pothole = r < 1 ? -(0.15 + random * 0.2) * (1 - r * r) ** 2 * detailFade : 0
  return band(32, 0.32, 0.7) + band(17, 0.16, 2.1) + band(9, 0.07, -0.4) + pothole
}
