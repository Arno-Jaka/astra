// Multi-scale procedural Mars surface detail layered on top of NASA MOLA DEM.
// Inspired by the Three.js Mars landform generator: rocky ground, sloped rough
// hills, ridged mountains/buttes and impact-like depressions (illustrative,
// sub-MOLA relief; never used by the NASA route planner). World-anchored and
// band-limited by spacing so it fades out at coarse LODs.
export function surfaceDetail(lon: number, lat: number, spacingM: number): number {
  if (spacingM >= 12) return 0

  const metersPerDegLat = 59238
  const metersPerDegLon = metersPerDegLat * Math.cos((lat * Math.PI) / 180)
  const x = lon * metersPerDegLon
  const y = lat * metersPerDegLat

  const hash = (ix: number, iy: number, s = 0) => {
    const n = Math.sin(ix * 127.1 + iy * 311.7 + s * 74.7) * 43758.5453123
    return n - Math.floor(n)
  }
  const smoothNoise = (px: number, py: number, s = 0) => {
    const ix = Math.floor(px), iy = Math.floor(py)
    const fx = px - ix, fy = py - iy
    const ux = fx * fx * (3 - 2 * fx)
    const uy = fy * fy * (3 - 2 * fy)
    const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
  }
  const fbm = (px: number, py: number, octaves = 4, s = 0) => {
    let value = 0, amp = 0.5, freq = 1
    for (let i = 0; i < octaves; i++) {
      value += amp * (smoothNoise(px * freq, py * freq, s + i * 17.3) * 2 - 1)
      freq *= 2.04
      amp *= 0.5
    }
    return value
  }
  const ridged = (px: number, py: number, octaves = 4, s = 0) => {
    let value = 0, amp = 0.5, freq = 1, weight = 1
    for (let i = 0; i < octaves; i++) {
      let signal = 1 - Math.abs(smoothNoise(px * freq, py * freq, s + i * 29.1) * 2 - 1)
      signal *= signal
      signal *= weight
      weight = Math.max(0, Math.min(1, signal * 1.8))
      value += signal * amp
      freq *= 2.12
      amp *= 0.5
    }
    return value
  }

  // Fade each wavelength band by available spacing so detail is sub-pixel/LOD-safe.
  const bandAmp = (wavelength: number, amplitude: number) => {
    const fade = Math.max(0, Math.min(1, wavelength / spacingM / 3.5 - 1))
    return amplitude * fade * fade * (3 - 2 * fade)
  }

  // A. Rocky ground micro-roughness (jagged regolith/scree feel)
  const rockyGround =
    ridged(x / 28, y / 28, 3, 11) * bandAmp(14, 0.9) +
    fbm(x / 18, y / 18, 3, 23) * bandAmp(9, 0.45)

  // B. Small sloped rough hills & mounds
  const smallHills = fbm(x / 90, y / 90, 4, 37) * bandAmp(45, 3.2) +
    ridged(x / 70, y / 70, 3, 41) * bandAmp(35, 1.6)

  // C. Big sloped rough hills (rolling swells with erosion)
  const bigHills = (fbm(x / 220, y / 220, 4, 53) * 0.65 + ridged(x / 180, y / 180, 3, 59) * 0.35) * bandAmp(110, 8.0)

  // D. Small mountains/buttes (medium steep ridged peaks)
  const smallMtnMask = Math.max(0, fbm(x / 420, y / 420, 3, 67) + 0.25)
  const smallMountains = ridged(x / 320, y / 320, 4, 71) * bandAmp(160, 14.0) * smallMtnMask

  // E. Large ridged mountain forms (subtle at close LOD, blends with MOLA at distance)
  const bigMtnMask = Math.pow(Math.max(0, fbm(x / 900, y / 900, 3, 79) + 0.45), 1.6)
  const bigMountains = ridged(x / 700, y / 700, 4, 83) * bandAmp(350, 22.0) * bigMtnMask

  // F. Impact-like craters with raised rims (compact, smooth-edged)
  let crater = 0
  const cell = 140
  const cx = Math.floor(x / cell)
  const cy = Math.floor(y / cell)
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const ix = cx + ox, iy = cy + oy
      const r1 = hash(ix, iy, 101), r2 = hash(ix, iy, 103), r3 = hash(ix, iy, 107)
      if (r1 < 0.35) continue
      const centerX = (ix + 0.15 + r2 * 0.7) * cell
      const centerY = (iy + 0.15 + r3 * 0.7) * cell
      const radius = 18 + hash(ix, iy, 109) * 32
      const depth = (1.2 + hash(ix, iy, 113) * 2.8) * bandAmp(radius, 1)
      const d = Math.hypot(x - centerX, y - centerY)
      if (d < radius * 1.45) {
        const norm = d / radius
        if (norm < 1) crater += (norm * norm - 1) * depth
        else crater += Math.exp(-Math.pow((norm - 1.05) * 5, 2)) * (depth * 0.35)
      }
    }
  }

  return rockyGround + smallHills + bigHills + smallMountains + bigMountains + crater
}
