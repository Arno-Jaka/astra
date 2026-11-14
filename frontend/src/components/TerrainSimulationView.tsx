import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { useAppStore } from '../store/appStore'
import { useDriveStore } from '../store/driveStore'
import { useScienceStore } from '../store/scienceStore'
import { sampleRoute } from '../map/routePath'
import { SCIENCE_META } from '../map/scienceExperiments'

type Bounds = { west: number; south: number; east: number; north: number }

const MARS_RADIUS_M = 3_396_190
const CREW_URLS = [
  new URL('../3D _assets/Astronaut_FinnTheFrog.gltf', import.meta.url).href,
  new URL('../3D _assets/Astronaut_RaeTheRedPanda.gltf', import.meta.url).href,
  new URL('../3D _assets/Astronaut_FernandoTheFlamingo.gltf', import.meta.url).href,
]

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

function wrapLonDelta(lon: number, ref: number) {
  let d = lon - ref
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

function routeBoundsFromCoords(all: [number, number][][], distanceKm: number): Bounds | null {
  const coords = all.flat()
  if (coords.length < 2) return null
  const refLon = coords[0][0]
  const unwrapped = coords.map((c) => refLon + wrapLonDelta(c[0], refLon))
  const lats = coords.map((c) => c[1])
  const west = Math.min(...unwrapped)
  const east = Math.max(...unwrapped)
  const south = Math.min(...lats)
  const north = Math.max(...lats)
  const spanLon = Math.max(east - west, 0.02)
  const spanLat = Math.max(north - south, 0.02)
  // tighter fit around NASA route data, with enough margin for prominent site context
  const padLon = Math.max(spanLon * 0.45, 0.04, distanceKm * 0.01)
  const padLat = Math.max(spanLat * 0.45, 0.04, distanceKm * 0.01)
  return {
    west: clamp(west - padLon, -360, 360),
    south: clamp(south - padLat, -89.5, 89.5),
    east: clamp(east + padLon, -360, 360),
    north: clamp(north + padLat, -89.5, 89.5),
  }
}

function lonLatToLocal(lon: number, lat: number, b: Bounds) {
  const midLat = ((b.north + b.south) / 2) * Math.PI / 180
  const mPerDegLat = (Math.PI / 180) * MARS_RADIUS_M
  const mPerDegLon = mPerDegLat * Math.cos(midLat)
  const lonSpanM = Math.max((b.east - b.west) * mPerDegLon, 1)
  const latSpanM = Math.max((b.north - b.south) * mPerDegLat, 1)
  const worldSize = 320
  const scale = worldSize / Math.max(lonSpanM, latSpanM)
  const cx = (b.west + b.east) / 2
  const cy = (b.north + b.south) / 2
  const x = (lon - cx) * mPerDegLon * scale
  const z = (cy - lat) * mPerDegLat * scale
  return { x, z, scale }
}

function sampleHeightmap(
  hm: Float32Array, w: number, h: number, b: Bounds, lon: number, lat: number,
) {
  const u = clamp((lon - b.west) / Math.max(b.east - b.west, 1e-9), 0, 1)
  const v = clamp((b.north - lat) / Math.max(b.north - b.south, 1e-9), 0, 1)
  const fx = u * (w - 1)
  const fy = v * (h - 1)
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1)
  const tx = fx - x0, ty = fy - y0
  const i00 = hm[y0 * w + x0] ?? 0
  const i10 = hm[y0 * w + x1] ?? 0
  const i01 = hm[y1 * w + x0] ?? 0
  const i11 = hm[y1 * w + x1] ?? 0
  const a = i00 + (i10 - i00) * tx
  const c = i01 + (i11 - i01) * tx
  return a + (c - a) * ty
}

function createNoise2D(seedVal: number) {
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + seedVal * 74.7) * 43758.5453123
    return n - Math.floor(n)
  }
  const smoothNoise = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = x - ix, fy = y - iy
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
  }
  const fbm = (x: number, y: number, octaves = 5) => {
    let value = 0, amp = 0.5, freq = 1
    for (let i = 0; i < octaves; i++) { value += amp * (smoothNoise(x * freq, y * freq) * 2 - 1); freq *= 2.04; amp *= 0.5 }
    return value
  }
  const ridged = (x: number, y: number, octaves = 5) => {
    let value = 0, amp = 0.5, freq = 1, weight = 1
    for (let i = 0; i < octaves; i++) {
      let signal = 1 - Math.abs(smoothNoise(x * freq, y * freq) * 2 - 1)
      signal *= signal; signal *= weight; weight = Math.max(0, Math.min(1, signal * 1.8))
      value += signal * amp; freq *= 2.12; amp *= 0.5
    }
    return value
  }
  return { hash, fbm, ridged }
}

async function fetchDemTileOnce(b: Bounds, width = 128, height = 128): Promise<Float32Array | null> {
  const params = new URLSearchParams({
    west: String(b.west), south: String(b.south), east: String(b.east), north: String(b.north),
    width: String(width), height: String(height),
  })
  try {
    const res = await fetch(`/api/dem/tile?${params}`)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength !== width * height * 4) return null
    return new Float32Array(buf)
  } catch {
    return null
  }
}

async function fetchDemTile(b: Bounds): Promise<{ data: Float32Array; w: number; h: number; b: Bounds } | null> {
  // Multi-tile (2x2) sampling for higher fidelity/coverage on prominent sites, fallback to single tile
  try {
    const midLon = (b.west + b.east) / 2
    const midLat = (b.north + b.south) / 2
    const quads: Bounds[] = [
      { west: b.west, south: midLat, east: midLon, north: b.north },
      { west: midLon, south: midLat, east: b.east, north: b.north },
      { west: b.west, south: b.south, east: midLon, north: midLat },
      { west: midLon, south: b.south, east: b.east, north: midLat },
    ]
    const tiles = await Promise.all(quads.map((q) => fetchDemTileOnce(q, 64, 64)))
    if (tiles.every(Boolean)) {
      const tw = 64, th = 64, w = 128, h = 128
      const out = new Float32Array(w * h)
      const place = (tile: Float32Array, ox: number, oy: number) => {
        for (let y = 0; y < th; y++) {
          for (let x = 0; x < tw; x++) {
            out[(oy + y) * w + (ox + x)] = tile[y * tw + x]
          }
        }
      }
      place(tiles[0]!, 0, 0); place(tiles[1]!, tw, 0); place(tiles[2]!, 0, th); place(tiles[3]!, tw, th)
      return { data: out, w, h, b }
    }
  } catch {}
  const data = await fetchDemTileOnce(b, 128, 128)
  return data ? { data, w: 128, h: 128, b } : null
}

function getVehicleUrl(vehicle: string | undefined) {
  if (vehicle === 'sev') return new URL('../3D _assets/Space Exploration Vehicle.glb', import.meta.url).href
  return '/models/perseverance.glb'
}

function dangerColor(type: string) {
  if (type === 'cliff') return 0xef4444
  if (type === 'rollover') return 0xf97316
  return 0xfacc15
}

export default function TerrainSimulationView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const route = useAppStore((s) => s.route)
  const routeChoice = useAppStore((s) => s.routeChoice)
  const previewT = useAppStore((s) => s.previewT)
  const driveDistanceKm = useDriveStore((s) => s.distanceKm)
  const driveTotalKm = useDriveStore((s) => s.totalKm)
  const active = useDriveStore((s) => s.active)
  const vehicle = useDriveStore((s) => s.vehicle)
  const missionPhase = useDriveStore((s) => s.missionPhase)
  const crash = useDriveStore((s) => s.crash)
  const braking = useDriveStore((s) => s.braking)
  const scienceSites = useScienceStore((s) => s.sites)
  const activeSiteId = useScienceStore((s) => s.activeSiteId)
  const sciencePhase = useScienceStore((s) => s.phase)
  const logs = useScienceStore((s) => s.logs)

  const traverse = useMemo(() => {
    if (!route) return null
    return routeChoice === 'hazardous' && route.hazardous ? route.hazardous : route
  }, [route, routeChoice])

  const bounds = useMemo(() => {
    if (!route) return null
    const sets: [number, number][][] = [route.coordinates as [number, number][]]
    if (route.hazardous?.coordinates?.length) sets.push(route.hazardous.coordinates as [number, number][])
    const dist = Math.max(route.distance_km ?? 0, route.hazardous?.distance_km ?? 0)
    return routeBoundsFromCoords(sets, dist || 1)
  }, [route])
  const siteKey = (route?.end || route?.start || 'mars').toLowerCase()

  const [dem, setDem] = useState<{ data: Float32Array; w: number; h: number; b: Bounds } | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!bounds) { setDem(null); return }
    const b = bounds
    ;(async () => {
      const result = await fetchDemTile(b)
      if (cancelled) return
      setDem(result)
    })()
    return () => { cancelled = true }
  }, [bounds?.west, bounds?.south, bounds?.east, bounds?.north])

  const paused = useDriveStore((s) => s.paused)
  const speedMps = useDriveStore((s) => s.speedMps)
  const warning = useDriveStore((s) => s.warning)
  const jumpRequested = useDriveStore((s) => s.jumpRequested)
  const jetRequested = useDriveStore((s) => s.jetRequested)

  const stateRef = useRef({
    traverse: null as any,
    bounds: null as Bounds | null,
    previewT: 0,
    active: false,
    driveDistanceKm: 0,
    driveTotalKm: 0,
    vehicle: 'rover' as string,
    missionPhase: 'aboard' as string,
    crash: null as any,
    braking: false,
    paused: false,
    speedMps: 0,
    warning: null as string | null,
    jumpRequested: false,
    jetRequested: false,
    scienceSites: [] as any[],
    activeSiteId: null as string | null,
    sciencePhase: 'off' as string,
    doneIds: new Set<string>(),
  })
  stateRef.current = {
    traverse, bounds, previewT, active, driveDistanceKm, driveTotalKm, vehicle,
    missionPhase, crash, braking, paused, speedMps, warning, jumpRequested, jetRequested,
    scienceSites, activeSiteId, sciencePhase,
    doneIds: new Set(logs.map((l) => l.siteId)),
  }

  const worldRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    sampleTerrainY: (x: number, z: number) => number
    terrainNormal: (x: number, z: number) => THREE.Vector3
    marker: THREE.Mesh
    vehicleObj: THREE.Group
    crewGroup: THREE.Group
    crewMixers: THREE.AnimationMixer[]
    crewActors: { mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>; current: string }[]
    scienceGroup: THREE.Group
    hazardGroup: THREE.Group
    target: THREE.Vector3
    spherical: { radius: number; theta: number; phi: number }
  } | null>(null)
  const scienceMeshesRef = useRef<{ id: string; obj: THREE.Object3D }[]>([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let seed = 42
    let dustHaze = 0.0085
    let detailScale = 1.0
    let rockDensity = 1.0
    const presets: Record<string, { seed?: number; dustHaze?: number; detailScale?: number; rockDensity?: number }> = {
      'gale crater': { seed: 137, dustHaze: 0.008, detailScale: 1.0, rockDensity: 0.9 },
      'mount sharp': { seed: 138, dustHaze: 0.0075, detailScale: 1.2, rockDensity: 0.8 },
      'jezero crater': { seed: 77, dustHaze: 0.009, detailScale: 1.0, rockDensity: 1.0 },
      'olympus mons': { seed: 226, dustHaze: 0.006, detailScale: 0.8, rockDensity: 0.6 },
      'valles marineris': { seed: 301, dustHaze: 0.009, detailScale: 1.3, rockDensity: 1.1 },
      'hellas planitia': { seed: 70, dustHaze: 0.01, detailScale: 0.8, rockDensity: 0.9 },
      'elysium mons': { seed: 147, dustHaze: 0.0075, detailScale: 0.9, rockDensity: 0.7 },
      'gusev crater': { seed: 175, dustHaze: 0.009, detailScale: 1.0, rockDensity: 1.0 },
      'meridiani planum': { seed: 357, dustHaze: 0.0085, detailScale: 0.7, rockDensity: 0.8 },
    }
    for (const [name, preset] of Object.entries(presets)) {
      if (siteKey.includes(name)) {
        seed = preset.seed ?? seed
        dustHaze = preset.dustHaze ?? dustHaze
        detailScale = preset.detailScale ?? detailScale
        rockDensity = preset.rockDensity ?? rockDensity
      }
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xc87448)
    scene.fog = new THREE.FogExp2(0xc46d40, dustHaze)

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight || 1, 0.5, 1200)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    container.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xe89b6b, 0x4a1d0d, 0.75))
    const sunLight = new THREE.DirectionalLight(0xffdfb8, 2.4)
    sunLight.position.set(120, 85, -110)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = 2048
    sunLight.shadow.mapSize.height = 2048
    sunLight.shadow.camera.near = 10
    sunLight.shadow.camera.far = 500
    const d = 180
    sunLight.shadow.camera.left = -d; sunLight.shadow.camera.right = d; sunLight.shadow.camera.top = d; sunLight.shadow.camera.bottom = -d
    sunLight.shadow.bias = -0.0005
    scene.add(sunLight)
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(12, 32), new THREE.MeshBasicMaterial({ color: 0xfff0dd, fog: false }))
    sunDisc.position.copy(sunLight.position).normalize().multiplyScalar(460)
    sunDisc.lookAt(0, 0, 0)
    scene.add(sunDisc)

    const noise = createNoise2D(seed)
    const terrainSize = 320
    const segments = 256
    const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments)
    geo.rotateX(-Math.PI / 2)
    const posAttr = geo.attributes.position
    const colors = new Float32Array(posAttr.count * 3)

    let baseElev = 0
    let elevScale = 0.015
    if (dem) {
      let minE = Infinity, maxE = -Infinity
      for (let i = 0; i < dem.data.length; i++) { const v = dem.data[i]; if (v < minE) minE = v; if (v > maxE) maxE = v }
      if (isFinite(minE) && isFinite(maxE)) { baseElev = (minE + maxE) / 2; elevScale = 0.02 }
    } else if (traverse?.profile?.length) {
      const es = traverse.profile.map((p: any) => p.elevation_m).filter((v: any): v is number => typeof v === 'number')
      if (es.length) { baseElev = (Math.min(...es) + Math.max(...es)) / 2; elevScale = 0.02 }
    }

    const getBaseHeight = (x: number, z: number) => {
      if (dem && bounds) {
        const b = dem.b
        const midLat = ((b.north + b.south) / 2) * Math.PI / 180
        const mPerDegLat = (Math.PI / 180) * MARS_RADIUS_M
        const mPerDegLon = mPerDegLat * Math.cos(midLat)
        const lonSpanM = Math.max((b.east - b.west) * mPerDegLon, 1)
        const latSpanM = Math.max((b.north - b.south) * mPerDegLat, 1)
        const scale = terrainSize / Math.max(lonSpanM, latSpanM)
        const cx = (b.west + b.east) / 2
        const cy = (b.north + b.south) / 2
        const lon = cx + x / (mPerDegLon * scale)
        const lat = cy - z / (mPerDegLat * scale)
        const elev = sampleHeightmap(dem.data, dem.w, dem.h, b, lon, lat)
        return (elev - baseElev) * elevScale
      }
      return 0
    }
    const detailHeight = (x: number, z: number, base: number) => {
      const hScale = detailScale
      const rockyGround = noise.ridged(x * 0.24, z * 0.24, 3) * 0.55 * hScale + noise.fbm(x * 0.65, z * 0.65, 2) * 0.22 * hScale
      const smallHills = noise.fbm(x * 0.075 + 4.2, z * 0.075 - 3.9, 4) * 1.4 * hScale
      const atten = 1 / (1 + Math.abs(base) * 0.12)
      return (rockyGround + smallHills * 0.5) * atten
    }
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i), z = posAttr.getZ(i)
      const base = getBaseHeight(x, z)
      posAttr.setY(i, base + detailHeight(x, z, base))
    }
    geo.computeVertexNormals()
    const normAttr = geo.attributes.normal
    const colorDust = new THREE.Color(0xc86438), colorRegolith = new THREE.Color(0x9c4224), colorBasalt = new THREE.Color(0x47281e), colorPeak = new THREE.Color(0xdba076), tempColor = new THREE.Color()
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i), ny = normAttr.getY(i)
      const slope = 1 - Math.max(0, Math.min(1, ny))
      const mineralPatch = noise.fbm(x * 0.05, z * 0.05, 3) * 0.5 + 0.5
      tempColor.copy(colorDust).lerp(colorRegolith, mineralPatch * 0.75)
      tempColor.lerp(colorBasalt, Math.min(1, Math.pow(slope * 2.4, 1.4)) * 0.88)
      if (y > 10) tempColor.lerp(colorPeak, Math.min(1, (y - 10) / 22) * (1 - Math.min(1, Math.pow(slope * 2.4, 1.4)) * 0.5) * 0.55)
      colors[i * 3] = tempColor.r; colors[i * 3 + 1] = tempColor.g; colors[i * 3 + 2] = tempColor.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const terrainMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.04, flatShading: true }))
    terrainMesh.receiveShadow = true; terrainMesh.castShadow = true
    scene.add(terrainMesh)

    const sampleTerrainY = (x: number, z: number) => getBaseHeight(x, z) + detailHeight(x, z, getBaseHeight(x, z))
    const terrainNormal = (x: number, z: number) => {
      const e = 0.6
      const hL = sampleTerrainY(x - e, z), hR = sampleTerrainY(x + e, z)
      const hD = sampleTerrainY(x, z - e), hU = sampleTerrainY(x, z + e)
      // normal from height gradient (DEM-contour aligned contact)
      const n = new THREE.Vector3(hL - hR, 2 * e, hD - hU)
      return n.normalize()
    }

    // rocks
    const createRockGeometry = (rockSeed: number) => {
      const rockGeo = new THREE.IcosahedronGeometry(1, 1)
      const rPos = rockGeo.attributes.position
      const rNoise = createNoise2D(rockSeed)
      for (let i = 0; i < rPos.count; i++) {
        const vx = rPos.getX(i), vy = rPos.getY(i), vz = rPos.getZ(i)
        const n = 0.72 + rNoise.fbm(vx * 1.8 + vy, vz * 1.8 - vy, 3) * 0.48
        rPos.setXYZ(i, vx * n, vy * n * 0.72, vz * n)
      }
      rockGeo.computeVertexNormals()
      return rockGeo
    }
    const rockVariants = [createRockGeometry(seed + 101), createRockGeometry(seed + 202), createRockGeometry(seed + 303)]
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b3524, roughness: 0.92, metalness: 0.05, flatShading: true })
    const totalRocks = Math.floor(700 * rockDensity)
    const rocksPerVariant = Math.max(1, Math.floor(totalRocks / rockVariants.length))
    const dummy = new THREE.Object3D(), rockTint = new THREE.Color()
    rockVariants.forEach((variantGeo, vIdx) => {
      const instMesh = new THREE.InstancedMesh(variantGeo, rockMat, rocksPerVariant)
      instMesh.castShadow = true; instMesh.receiveShadow = true
      for (let i = 0; i < rocksPerVariant; i++) {
        const idx = vIdx * rocksPerVariant + i
        const rx = (noise.hash(idx, 1.1) - 0.5) * (terrainSize * 0.9)
        const rz = (noise.hash(idx, 2.3) - 0.5) * (terrainSize * 0.9)
        const ry = sampleTerrainY(rx, rz)
        const sizeRoll = Math.pow(noise.hash(idx, 3.7), 3.4)
        const scaleBase = 0.18 + sizeRoll * 2.6
        dummy.position.set(rx, ry - scaleBase * 0.18, rz)
        dummy.rotation.set(noise.hash(idx, 4.1) * Math.PI, noise.hash(idx, 5.2) * Math.PI * 2, noise.hash(idx, 6.3) * Math.PI)
        dummy.scale.set(scaleBase * (0.8 + noise.hash(idx, 7.4) * 0.6), scaleBase * (0.65 + noise.hash(idx, 8.5) * 0.5), scaleBase * (0.8 + noise.hash(idx, 9.6) * 0.6))
        dummy.updateMatrix(); instMesh.setMatrixAt(i, dummy.matrix)
        const shade = 0.65 + noise.hash(idx, 10.7) * 0.55
        rockTint.setRGB(0.45 * shade, 0.22 * shade, 0.15 * shade); instMesh.setColorAt(i, rockTint)
      }
      instMesh.instanceMatrix.needsUpdate = true
      if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true
      scene.add(instMesh)
    })

    const hazardGroup = new THREE.Group(); scene.add(hazardGroup)
    const scienceGroup = new THREE.Group(); scene.add(scienceGroup)
    const crewGroup = new THREE.Group(); scene.add(crewGroup)

    // routes & hazards (sync NASA route/hazard data; show both variants when present)
    const drawRoute = (coords: [number, number][], color: number, opacity: number) => {
      if (!bounds || coords.length < 2) return
      const pts: THREE.Vector3[] = []
      for (const [lon, lat] of coords) {
        const p = lonLatToLocal(lon, lat, bounds)
        const y = sampleTerrainY(p.x, p.z)
        pts.push(new THREE.Vector3(p.x, y + 0.22, p.z))
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts)
      scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity })))
    }
    const drawDangers = (dangers: any[], dim: boolean) => {
      if (!bounds) return
      for (const danger of dangers ?? []) {
        const p = lonLatToLocal(danger.lon, danger.lat, bounds)
        const y = sampleTerrainY(p.x, p.z)
        const color = dangerColor(danger.type)
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.15, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: dim ? 0.35 : 0.7, side: THREE.DoubleSide }))
        ring.rotation.x = -Math.PI / 2
        ring.position.set(p.x, y + 0.18, p.z)
        hazardGroup.add(ring)
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: dim ? 0.08 : 0.22, transparent: dim, opacity: dim ? 0.55 : 1 }))
        cone.position.set(p.x, y + 0.72, p.z)
        hazardGroup.add(cone)
      }
    }
    if (route && bounds) {
      const activeIsHazardous = routeChoice === 'hazardous' && !!route.hazardous
      // alternate route dimmed for context/sync
      if (route.hazardous?.coordinates?.length) {
        if (activeIsHazardous) {
          drawRoute(route.coordinates as [number, number][], 0x38bdf8, 0.35)
          drawDangers(route.dangers ?? [], true)
        } else {
          drawRoute(route.hazardous.coordinates as [number, number][], 0xf97316, 0.35)
          drawDangers(route.hazardous.dangers ?? [], true)
        }
      }
      // active traverse emphasized
      const activeCoords = (activeIsHazardous ? route.hazardous!.coordinates : route.coordinates) as [number, number][]
      drawRoute(activeCoords, activeIsHazardous ? 0xf97316 : 0x22d3ee, 0.95)
      drawDangers((activeIsHazardous ? route.hazardous!.dangers : route.dangers) ?? [], false)
    } else if (traverse && bounds) {
      drawRoute(traverse.coordinates as [number, number][], 0x22d3ee, 0.9)
      drawDangers((traverse as any).dangers ?? [], false)
    }

    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.8, 18, 18), new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0b4f5a, roughness: 0.4 }))
    marker.castShadow = true
    scene.add(marker)

    const vehicleGroup = new THREE.Group()
    scene.add(vehicleGroup)

    const spherical = { radius: 95, theta: 0.65, phi: 1.22 }
    const target = new THREE.Vector3(0, 4, 0)
    const updateCameraPosition = () => {
      spherical.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.04, spherical.phi))
      spherical.radius = Math.max(12, Math.min(240, spherical.radius))
      camera.position.x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta)
      camera.position.y = target.y + spherical.radius * Math.cos(spherical.phi)
      camera.position.z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta)
      camera.lookAt(target)
    }

    worldRef.current = { scene, camera, renderer, sampleTerrainY, terrainNormal, marker, vehicleObj: vehicleGroup, crewGroup, crewMixers: [], crewActors: [], scienceGroup, hazardGroup, target, spherical }

    let isDragging = false, isPanning = false, prevX = 0, prevY = 0
    const onPointerDown = (e: PointerEvent) => { isDragging = true; isPanning = e.button === 2 || e.shiftKey; prevX = e.clientX; prevY = e.clientY }
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return
      const dx = e.clientX - prevX, dy = e.clientY - prevY; prevX = e.clientX; prevY = e.clientY
      if (isPanning) {
        const panSpeed = spherical.radius * 0.0012
        const right = new THREE.Vector3(); camera.getWorldDirection(right); right.cross(camera.up).normalize()
        target.addScaledVector(right, -dx * panSpeed)
        target.y = Math.max(-10, Math.min(60, target.y + dy * panSpeed))
      } else { spherical.theta -= dx * 0.0055; spherical.phi -= dy * 0.0055 }
      updateCameraPosition()
    }
    const onPointerUp = () => { isDragging = false; isPanning = false }
    const onWheel = (e: WheelEvent) => { e.preventDefault(); spherical.radius += e.deltaY * 0.06; updateCameraPosition() }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()

    const domElem = renderer.domElement
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downX = 0, downY = 0
    const onPointerDownWrap = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; onPointerDown(e) }
    const onPointerUpWrap = (e: PointerEvent) => {
      onPointerUp()
      const dx = e.clientX - downX, dy = e.clientY - downY
      if (dx * dx + dy * dy > 36 || e.button !== 0) return
      const rect = domElem.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(scienceMeshesRef.current.map((m) => m.obj), true)
      const hit = hits[0]?.object
      let siteId: string | null = null
      let cur: THREE.Object3D | null = hit ?? null
      while (cur && !siteId) { siteId = (cur.userData?.siteId as string) || null; cur = cur.parent }
      if (!siteId) return
      const ss = useScienceStore.getState()
      const site = ss.sites.find((s) => s.id === siteId)
      if (!site) return
      if (ss.phase === 'off' && ss.promptSiteId !== siteId) ss.prompt(siteId)
      else if (ss.phase === 'done' && ss.activeSiteId) {
        // allow requesting move to another nearby site from a completed stop
        if (siteId !== ss.activeSiteId) ss.requestMove(siteId)
        else if (ss.canBoard) ss.requestBoard()
      } else if (ss.phase === 'off' && ss.promptSiteId === siteId) {
        ss.acceptDetour(siteId)
      }
    }
    domElem.addEventListener('pointerdown', onPointerDownWrap)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUpWrap)
    domElem.addEventListener('wheel', onWheel, { passive: false })
    domElem.addEventListener('contextmenu', onContextMenu)

    const handleResize = () => {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight || 1
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    const clock = new THREE.Clock()
    let first = true
    let animId = 0
    let jumpT = -1
    let jetT = -1
    let bob = 0
    const crewPos: { x: number; z: number; init: boolean }[] = []
    const animate = () => {
      animId = requestAnimationFrame(animate)
      const dt = Math.min(clock.getDelta(), 0.1)
      const w = worldRef.current
      if (w) {
        const st = stateRef.current
        const t = st.active && st.driveTotalKm > 0 ? Math.min(1, Math.max(0, st.driveDistanceKm / st.driveTotalKm)) : st.previewT
        if (st.traverse && st.bounds) {
          try {
            const s = sampleRoute(st.traverse as any, t)
            const p = lonLatToLocal(s.lon, s.lat, st.bounds)
            // multi-point DEM contact sampling (approx wheel/contact adherence to contours)
            const offsets = [[0, 0], [0.9, 0.7], [0.9, -0.7], [-0.9, 0.7], [-0.9, -0.7]]
            let y = -Infinity
            for (const [ox, oz] of offsets) y = Math.max(y, w.sampleTerrainY(p.x + ox, p.z + oz))
            const ahead = sampleRoute(st.traverse as any, Math.min(1, t + 0.002))
            const ap = lonLatToLocal(ahead.lon, ahead.lat, st.bounds)
            const ay = w.sampleTerrainY(ap.x, ap.z)
            const dx = ap.x - p.x, dz = ap.z - p.z
            const len = Math.hypot(dx, dz) || 1
            const fwd = new THREE.Vector3(dx / len, (ay - y) / len, dz / len).normalize()
            const up = w.terrainNormal(p.x, p.z)
            const right = new THREE.Vector3().crossVectors(fwd, up).normalize()
            const correctedFwd = new THREE.Vector3().crossVectors(up, right).normalize()
            const basis = new THREE.Matrix4().makeBasis(right, up, correctedFwd)
            const q = new THREE.Quaternion().setFromRotationMatrix(basis)

            // hazard-aware visual cue on DEM route (aligned with route dangers)
            const dangers = (st.traverse as any).dangers ?? []
            let nearHazard = false
            for (const danger of dangers) {
              const dp = lonLatToLocal(danger.lon, danger.lat, st.bounds)
              if (Math.hypot(dp.x - p.x, dp.z - p.z) < 2.2) { nearHazard = true; break }
            }
            const hazardActive = nearHazard || !!st.warning
            w.marker.material = new THREE.MeshStandardMaterial({ color: hazardActive ? 0xf97316 : 0x22d3ee, emissive: hazardActive ? 0x7c2d12 : 0x0b4f5a, roughness: 0.4 })
            w.marker.position.set(p.x, y + 1.1, p.z)
            w.marker.visible = true

            // speed/braking/pausing response (visual dynamics on contour surface)
            const moving = st.active && !st.paused && st.speedMps > 0.02 && !st.crash
            bob += dt * (moving ? 6 + Math.min(6, st.speedMps * 0.8) : 2)
            const bobAmt = moving ? Math.sin(bob) * 0.03 : 0
            const brakeDip = st.braking ? -0.05 : 0
            w.vehicleObj.position.set(p.x, y + 0.28 + bobAmt + brakeDip, p.z)
            w.vehicleObj.quaternion.copy(q)
            if (st.braking) w.vehicleObj.rotateX(0.04)
            w.vehicleObj.visible = st.missionPhase === 'aboard' || st.missionPhase === 'rover-approach' || st.missionPhase === 'complete' || st.missionPhase === 'hold' || st.active || t >= 0

            // jump/jet/crash responses (animated, on DEM-aligned pose)
            if (st.jumpRequested && jumpT < 0) { jumpT = 0; useDriveStore.setState({ jumpRequested: false }) }
            if (st.jetRequested && jumpT < 0) { jetT = 0; useDriveStore.setState({ jetRequested: false }) }
            if (jumpT >= 0) { jumpT += dt; const j = Math.sin(Math.min(1, jumpT / 0.7) * Math.PI); w.vehicleObj.position.y += j * 1.1; if (jumpT > 0.7) jumpT = -1 }
            if (jetT >= 0) { jetT += dt; w.vehicleObj.position.y += Math.min(1, jetT / 0.8) * 2.2; if (jetT > 1.2) jetT = -1 }
            if (st.crash) {
              if (st.crash.type === 'rollover') w.vehicleObj.rotateZ(1.2)
              if (st.crash.type === 'fall') w.vehicleObj.position.y -= 0.8
              if (st.crash.type === 'jet' && jetT < 0) w.vehicleObj.position.y += 1.6
            }

            // crew placement/movement on DEM surface (mission/science phases)
            const crewVisiblePhases = ['disembarking', 'crew-approach', 'science', 'rover-approach', 'hold', 'complete']
            const showCrew = crewVisiblePhases.includes(st.missionPhase) || (st.sciencePhase !== 'off' && st.sciencePhase !== 'boarding')
            w.crewGroup.visible = showCrew && w.crewGroup.children.length > 0
            if (showCrew) {
              const activeSite = st.scienceSites.find((site: any) => site.id === st.activeSiteId)
              const baseLon = activeSite?.lon ?? s.lon
              const baseLat = activeSite?.lat ?? s.lat
              const phase = st.sciencePhase !== 'off' ? st.sciencePhase : st.missionPhase
              const bnd = st.bounds
              const bp = lonLatToLocal(baseLon, baseLat, bnd)
              // vehicle-relative anchor on DEM surface for disembark/return phases
              const vp = lonLatToLocal(s.lon, s.lat, bnd)
              const setClip = (actorIdx: number, name: string) => {
                const actor = w.crewActors[actorIdx]
                if (!actor) return
                const want = actor.actions[name] ? name : (actor.actions.Idle ? 'Idle' : actor.current)
                if (want !== actor.current && actor.actions[want]) {
                  const prev = actor.actions[actor.current]
                  const next = actor.actions[want]
                  if (prev && prev !== next) prev.fadeOut(0.2)
                  next.reset().fadeIn(0.2).play()
                  actor.current = want
                }
              }
              for (let i = 0; i < w.crewGroup.children.length; i++) {
                const child = w.crewGroup.children[i] as THREE.Object3D
                let tx = bp.x, tz = bp.z, face = -s.bearing, clip = 'Walk'
                const ang = (i / Math.max(1, w.crewGroup.children.length)) * Math.PI * 2
                if (phase === 'disembarking') { tx = vp.x + (i - 1) * 0.12; tz = vp.z + 0.18 + i * 0.06; clip = 'Walk' }
                else if (phase === 'crew-approach' || phase === 'approach' || phase === 'travelling') { tx = bp.x + (i - 1) * 0.1; tz = bp.z + 0.25 + i * 0.05; clip = 'Walk' }
                else if (phase === 'working' || phase === 'science') { tx = bp.x + Math.cos(ang) * 0.16; tz = bp.z + Math.sin(ang) * 0.16; face = ang + Math.PI; clip = w.crewActors[i]?.actions['Duck'] ? 'Duck' : 'Idle' }
                else if (phase === 'done') { tx = bp.x + Math.cos(ang) * 0.14; tz = bp.z + Math.sin(ang) * 0.14; face = ang; clip = 'Idle' }
                else if (phase === 'rover-approach' || phase === 'boarding') { tx = vp.x + (i - 1) * 0.1; tz = vp.z + 0.12 + (2 - i) * 0.05; clip = 'Walk' }
                else { tx = vp.x + (i - 1) * 0.1; tz = vp.z + 0.2 + i * 0.05; clip = 'Idle' }
                if (!crewPos[i]) crewPos[i] = { x: tx, z: tz, init: true }
                const cp = crewPos[i]
                if (!cp.init) { cp.x = tx; cp.z = tz; cp.init = true }
                const speed = (phase === 'working' || phase === 'done' || phase === 'science') ? 0.6 : 1.4
                const lerp = 1 - Math.exp(-speed * dt)
                cp.x += (tx - cp.x) * lerp
                cp.z += (tz - cp.z) * lerp
                const movingNow = Math.hypot(tx - cp.x, tz - cp.z) > 0.03
                if (movingNow && (clip === 'Idle' || clip === 'Duck') && (phase === 'crew-approach' || phase === 'travelling' || phase === 'disembarking' || phase === 'rover-approach' || phase === 'boarding')) clip = 'Walk'
                const cy = w.sampleTerrainY(cp.x, cp.z)
                child.position.set(cp.x, cy, cp.z)
                child.rotation.y = face
                setClip(i, clip)
              }
              for (const mixer of w.crewMixers) mixer.update(dt)
            } else {
              for (let i = 0; i < crewPos.length; i++) crewPos[i].init = false
            }

            if (first) { w.target.set(p.x, y + 1.5, p.z); first = false }
          } catch { w.marker.visible = false }
        } else {
          w.marker.visible = false
          w.vehicleObj.visible = false
          w.crewGroup.visible = false
        }
        updateCameraPosition()
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      worldRef.current = null
      window.removeEventListener('resize', handleResize)
      domElem.removeEventListener('pointerdown', onPointerDownWrap)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUpWrap)
      domElem.removeEventListener('wheel', onWheel)
      domElem.removeEventListener('contextmenu', onContextMenu)
      cancelAnimationFrame(animId)
      renderer.dispose()
      if (domElem && container.contains(domElem)) container.removeChild(domElem)
    }
  }, [siteKey, traverse, bounds, dem])

  // Load vehicle model
  useEffect(() => {
    const w = worldRef.current
    if (!w) return
    const group = w.vehicleObj
    while (group.children.length) group.remove(group.children[0])
    const placeholder = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 2.2), new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7, metalness: 0.2 }))
    placeholder.position.y = 0.35
    placeholder.castShadow = true
    group.add(placeholder)
    let cancelled = false
    const loader = new GLTFLoader()
    loader.load(getVehicleUrl(vehicle), (gltf) => {
      if (cancelled || worldRef.current?.vehicleObj !== group) return
      group.clear()
      const model = gltf.scene
      const box = new THREE.Box3().setFromObject(model)
      const size = new THREE.Vector3(); box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      const targetSize = vehicle === 'sev' ? 4.5 : 3.0
      const s = targetSize / maxDim
      model.scale.setScalar(s)
      box.setFromObject(model)
      model.position.y -= box.min.y
      model.traverse((obj) => { if ((obj as THREE.Mesh).isMesh) { obj.castShadow = true; obj.receiveShadow = true } })
      group.add(model)
    }, undefined, () => {})
    return () => { cancelled = true }
  }, [vehicle, traverse, bounds, dem, siteKey])

  // Load crew models
  useEffect(() => {
    const w = worldRef.current
    if (!w) return
    const group = w.crewGroup
    while (group.children.length) group.remove(group.children[0])
    w.crewMixers = []
    w.crewActors = []
    let cancelled = false
    const loader = new GLTFLoader()
    CREW_URLS.forEach((url, i) => {
      loader.load(url, (gltf) => {
        if (cancelled || worldRef.current?.crewGroup !== group) return
        const model = gltf.scene
        const box = new THREE.Box3().setFromObject(model)
        const size = new THREE.Vector3(); box.getSize(size)
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const s = 1.6 / maxDim
        model.scale.setScalar(s)
        box.setFromObject(model)
        model.position.y -= box.min.y
        model.traverse((obj) => { if ((obj as THREE.Mesh).isMesh) { obj.castShadow = true; obj.receiveShadow = true } })
        model.userData.crewIndex = i
        group.add(model)
        if (gltf.animations?.length) {
          const mixer = new THREE.AnimationMixer(model)
          const actions: Record<string, THREE.AnimationAction> = {}
          for (const name of ['Idle', 'Walk', 'Jump', 'Duck']) {
            const clip = THREE.AnimationClip.findByName(gltf.animations, name)
            if (clip) actions[name] = mixer.clipAction(clip)
          }
          if (!actions.Idle && gltf.animations[0]) actions.Idle = mixer.clipAction(gltf.animations[0])
          const start = actions.Idle || Object.values(actions)[0]
          if (start) start.play()
          w.crewMixers.push(mixer)
          w.crewActors.push({ mixer, actions, current: start ? (Object.keys(actions).find(k => actions[k] === start) || 'Idle') : 'Idle' })
        }
      }, undefined, () => {})
    })
    return () => { cancelled = true }
  }, [traverse, bounds, dem, siteKey])

  // Render science site markers in 3D
  useEffect(() => {
    const w = worldRef.current
    if (!w || !bounds) return
    const g = w.scienceGroup
    while (g.children.length) g.remove(g.children[0])
    scienceMeshesRef.current = []
    const done = new Set(logs.map((l) => l.siteId))
    for (const site of scienceSites) {
      const p = lonLatToLocal(site.lon, site.lat, bounds)
      const y = w.sampleTerrainY(p.x, p.z)
      const isActive = site.id === activeSiteId
      const isDone = done.has(site.id)
      const baseColor = isDone ? 0x94a3b8 : (parseInt((SCIENCE_META[site.kind]?.color ?? '#38bdf8').replace('#', ''), 16) || 0x38bdf8)
      const group = new THREE.Group()
      const ring = new THREE.Mesh(new THREE.RingGeometry(isActive ? 1.0 : 0.7, isActive ? 1.6 : 1.1, 28), new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: isDone ? 0.35 : 0.7, side: THREE.DoubleSide }))
      ring.rotation.x = -Math.PI / 2
      ring.position.set(0, 0.18, 0)
      group.add(ring)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, isActive ? 2.2 : 1.4, 8), new THREE.MeshStandardMaterial({ color: baseColor, emissive: baseColor, emissiveIntensity: isActive ? 0.4 : 0.15 }))
      pole.position.set(0, isActive ? 1.3 : 0.9, 0)
      group.add(pole)
      group.position.set(p.x, y, p.z)
      group.userData.siteId = site.id
      g.add(group)
      scienceMeshesRef.current.push({ id: site.id, obj: group })
    }
  }, [scienceSites, activeSiteId, logs, bounds, dem, traverse, siteKey])

  return (
    <div className="absolute inset-0 h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {!dem && traverse && (
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/50 px-2 py-1 text-[10px] text-neutral-200 backdrop-blur">
          Loading NASA MOLA terrain contours…
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/50 px-2 py-1 text-[10px] text-neutral-300 backdrop-blur">
        3D mode (NASA MOLA contours + procedural detail) · rover/SEV/crew & markers on DEM surface · drag orbit · shift-drag pan · scroll zoom
      </div>
    </div>
  )
}
