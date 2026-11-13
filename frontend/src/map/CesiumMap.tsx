import { useEffect, useRef, useState } from 'react'
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ColorBlendMode,
  ConstantPositionProperty,
  ConstantProperty,
  EllipsoidTerrainProvider,
  Globe,
  HeadingPitchRange,
  HeightReference,
  Math as CesiumMath,
  Matrix3,
  Matrix4,
  Model,
  ModelAnimationLoop,
  NearFarScalar,
  ParticleSystem,
  ParticleBurst,
  PerspectiveFrustum,
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty,
  SphereEmitter,
  sampleTerrain,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  VerticalOrigin,
  Viewer,
} from 'cesium'
import type {
  Entity,
  ImageryLayer,
  ImageryProvider,
  Particle,
  TerrainProvider,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import DriveHud from '../components/DriveHud'
import MapExplorer from '../components/MapExplorer'
import RoverCameraWindow, { type RoverViewPose } from '../components/RoverCameraWindow'
import LayerPanel from '../components/LayerPanel'
import {
  briefingSchema,
  conditionsSchema,
  routeSchema,
  useAppStore,
  type RouteData,
  type RouteDanger,
  type RoutePhase,
} from '../store/appStore'
import { useDriveStore } from '../store/driveStore'
import { useLayerStore, type BaseLayerId } from '../store/layerStore'
import { onCommand } from '../ws/commandChannel'
import {
  sampleRoute,
  selectTraverse,
  wrapPi,
  type RouteSample,
  type TraversableRoute,
} from './routePath'
import { createSlopeOverlayProvider } from './slopeLayer'
import { contactLift } from './roverContact'
import { assignVehicle } from './taskAssignment'
import { vehicleModel } from './vehicleModels'
import { planCrewMission } from './crewMission'
import { createSurfaceCrew, type SurfaceCrew } from './surfaceCrew'
import { advanceDrive, arrivalSpeedLimit } from './driveMotion'
import { advanceCrash, bodySupport, terrainSupport, topplesAtCliff, type CrashBody } from './crashPhysics'
import { createDriveSurface } from './driveSurface'
import { declutterLabels } from './labelLayout'
import { createWheelDust } from './wheelDust'
import { createWeatherFx, type WeatherFx } from './weatherFx'
import { createMolaTerrainProvider } from './terrain'
import { MARS, MOLA_SHADE, VIKING, createTrekProvider } from './trek'
import EnvironmentOverlay from './EnvironmentOverlay'
import { useWeatherStore, weatherElapsedS } from '../store/weatherStore'

/** Lift the rover origin (wheel plane) this far above the sampled ground. */
const ROVER_GROUND_CLEARANCE = 0.03
/** Cap the terrain-tilt of the rover so LOD seams never flip it on its side. */
const ROVER_MAX_TILT_RAD = CesiumMath.toRadians(32)
/** Half-spacing of the terrain probes used for the local surface normal. */
const TERRAIN_SAMPLE_M = 1.5
/** Degrees of latitude per metre on Mars ((pi/180) * 3_396_190 m). */
const METERS_PER_DEG = 59_238

/**
 * GTA-style third-person chase camera: the user can drag to orbit around
 * the rover and scroll to zoom while it drives; the camera recenters behind
 * the rover when released and is always pushed above the terrain.
 */
const ORBIT = {
  defaultPitch: 0.2,
  defaultDistance: 10.5,
  minDistance: 3.5,
  maxDistance: 20,
  /** Never dip below horizontal: low angles clip into terrain on slopes. */
  minPitch: 0.05,
  maxPitch: 1.2,
  /** Radians of camera yaw per pixel of drag. */
  dragYawPerPx: 0.006,
  dragPitchPerPx: 0.005,
  /** How fast the camera drifts back behind the rover (per second). */
  recenterPerS: 1.5,
  margin: 3.0,
} as const

/**
 * Suspension feeds a smoothed body-pitch response. Wheel clearance is
 * constrained separately against the terrain envelope, with no airtime or
 * downward wheel squish. The camera deliberately does NOT ride the
 * suspension — it keeps the rover centered on its own smoothed height.
 */
const SUSPENSION = {
  springPerS: 6,
  tiltGain: 0.0025,
  maxTiltRad: 0.08,
  /** How fast the pitch kick reacts (smoothing keeps LOD spikes invisible). */
  tiltSmoothPerS: 8,
} as const

/**
 * Chase-camera behaviour: horizontal position tracks the rover rigidly so
 * it stays centered, while height follows a slow spring so suspension bumps
 * never reach the lens. The aim point sits at rover-mast height, slightly
 * ahead along the heading so the view shows the terrain being driven into.
 */
const CHASE = {
  heightSpringPerS: 2.5,
  cameraHeadingPerS: 3,
  eyeHeightPerS: 4,
  aimUpM: 1.15,
  aimLeadM: 0.6,
  /** Heading/normal smoothing rates (per second, frame-rate independent). */
  headingPerS: 10,
  normalPerS: 16,
} as const

/** Drive controls while the scout simulation runs. */
const KEYS: Record<
  'speedUp' | 'slowDown' | 'pause' | 'recenter' | 'end',
  readonly string[]
> = {
  speedUp: ['ArrowUp', 'KeyW'],
  slowDown: ['ArrowDown', 'KeyS'],
  pause: ['Space'],
  recenter: ['KeyC'],
  end: ['Escape'],
}
const SPEED_MIN = 0.25
const SPEED_MAX = 4
const SPEED_STEP = 1.5

/**
 * Terrain pre-sampling for the drive: `sampleTerrain` over route points at
 * ~the rendered tile level gives mesh-consistent heights along the whole
 * corridor (the 0.5 km route-profile interpolation can sit tens of metres
 * below the real surface in rugged terrain), and the same `/api/dem/tile`
 * requests warm the browser cache the globe will hit during the drive.
 */
const CORRIDOR = {
  level: 12,
  maxPoints: 400,
  timeoutMs: 6000,
} as const

/** Extra ground clearance per unit of body tilt (metres at full tilt cap). */
const TILT_CLEARANCE_M = 1.0

/**
 * Crash simulation on a hazardous traverse. The mission slope limit acts as
 * an illustrative stability envelope: the rover loses control
 * (rollover) when the live grade passes the envelope (max(12°, limit +
 * 0.25°), matching the backend danger classification) and falls on
 * cliff-like grades, then tumbles downhill with decaying bounces and
 * wrecks in blue electrical arcing — combustion is impossible in Mars'
 * thin CO₂ atmosphere, so the power bus discharge is the plausible
 * failure effect. Compliant routes stay at or below the requested limit,
 * so the safe route never crashes; the sparks are a dramatization, not a
 * physical hazard model (MOLA grades are regional estimates).
 */
const CRASH = {
  minRolloverGradeDeg: 12,
  gradeOverLimitDeg: 0.25,
  fallGradeDeg: 35,
  /** Mars surface gravity pulling the spark spatter down (m/s²). */
  sparkGravityMs2: 3.71,
  /** Steady spark spatter between crackles (particles/s). */
  sparkBasePerS: 24,
  /** Extra particles thrown by each crackle burst. */
  sparkBurstMin: 18,
  sparkBurstMax: 34,
  /** How long the arcing wreck is held before the drive ends (ms). */
  holdAfterCrashMs: 4200,
} as const

/**
 * Jagged arc-bolt flicker over the wreck: lightning-like discharge paths
 * regenerated and re-lit at random intervals. The dark gaps between
 * flashes are what make it read as electrical arcing rather than fire.
 */
const SPARK_BOLT = {
  count: 3,
  /** Maximum wander of a bolt endpoint from the wreck (metres, ENU). */
  radiusM: 2.8,
  minSegments: 4,
  maxSegments: 6,
  width: 2.4,
  onMs: 70,
  offMinMs: 50,
  offMaxMs: 330,
  tickMs: 40,
} as const

/**
 * Staggered crackle-burst times (seconds after the wreck settles), spacing
 * out so the arcing fades over the hold instead of popping uniformly.
 */
const SPARK_CRACKLE_S = [
  0.6, 1.4, 2.2, 3.1, 4.0, 5.2, 6.5, 8.0, 10, 13, 17, 22, 28, 35, 45, 58,
] as const

/**
 * Hard-edged particle texture for the sparks: a crisp dot, unlike a fire
 * plume's soft radial gradient. Sparks are point-like flashes, not glowing
 * blobs.
 */
function makeParticleTexture(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 26)
    gradient.addColorStop(0, 'rgba(255,255,255,1.0)')
    gradient.addColorStop(0.68, 'rgba(255,255,255,0.95)')
    gradient.addColorStop(0.78, 'rgba(255,255,255,0.0)')
    gradient.addColorStop(1, 'rgba(255,255,255,0.0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
  }
  return canvas
}

/** Camera pose while the user scrubs the traverse preview (metres, ENU). */
const PREVIEW = {
  distance: 420,
  height: 190,
  lookAhead: 820,
  targetHeight: 30,
  margin: 90,
} as const
const SCOUT_CRUISE_MPS = 1

type SiteInfo = {
  name: string
  lon: number
  lat: number
  kind: string
  description: string
  source_url: string
}

type StationInfo = {
  station_name: string
  site_name: string
  lon: number
  lat: number
  sol: string | number | null
  min_temp_c: number | null
  max_temp_c: number | null
  pressure_pa: number | null
}

type PoseOptions = {
  distance: number
  height: number
  lookAhead: number
  targetHeight: number
  margin: number
}

type OrbitState = {
  yaw: number
  pitch: number
  distance: number
  dragging: boolean
}

/**
 * Pre-sample the route corridor against the terrain provider at the
 * rendered tile level. Returns a distance→height lookup (mesh-consistent,
 * ~200–500 m spacing) or null if it could not complete in time. Heights
 * come from the same heightmaps the globe renders, so the rover keeps a
 * solid ground reference even while tiles stream in behind the
 * time-compressed drive. Fetched tiles are HTTP-cached for the drive.
 */
async function presampleCorridor(
  route: TraversableRoute,
  provider: TerrainProvider,
): Promise<((distanceKm: number) => number | undefined) | null> {
  const points = route.coordinates
  if (points.length < 2) return null
  const stride = Math.max(1, Math.ceil(points.length / CORRIDOR.maxPoints))
  const indices: number[] = []
  for (let index = 0; index < points.length; index += stride) {
    indices.push(index)
  }
  if (indices[indices.length - 1] !== points.length - 1) {
    indices.push(points.length - 1)
  }
  const positions = indices.map((index) => {
    const [lon, lat] = points[index] ?? [0, 0]
    return Cartographic.fromDegrees(lon, lat)
  })
  const timer = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), CORRIDOR.timeoutMs)
  })
  const sampled = await Promise.race([
    sampleTerrain(provider, CORRIDOR.level, positions).catch(() => null),
    timer,
  ])
  if (!sampled) return null

  const table = indices
    .map((index, order) => ({
      km: route.profile[index]?.distance_km ?? 0,
      height: sampled[order]?.height,
    }))
    .filter((entry) => Number.isFinite(entry.height))
  if (table.length < 2) return null

  return (distanceKm: number): number | undefined => {
    const first = table[0]
    const last = table[table.length - 1]
    if (distanceKm <= first.km) return first.height
    if (distanceKm >= last.km) return last.height
    let low = 0
    let high = table.length - 1
    while (high - low > 1) {
      const mid = (low + high) >> 1
      if ((table[mid]?.km ?? 0) <= distanceKm) low = mid
      else high = mid
    }
    const a = table[low]
    const b = table[high]
    if (!a || !b) return undefined
    const span = b.km - a.km
    const fraction = span > 0 ? (distanceKm - a.km) / span : 0
    return (a.height ?? 0) + ((b.height ?? 0) - (a.height ?? 0)) * fraction
  }
}

export default function CesiumMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const roverViewRef = useRef<RoverViewPose | null>(null)
  const [mapViewer, setMapViewer] = useState<Viewer | null>(null)
  const [terrainStatus, setTerrainStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const retryTerrainRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!containerRef.current) return

    const terrainProvider = createMolaTerrainProvider()
    const viewer = new Viewer(containerRef.current, {
      baseLayer: false,
      ellipsoid: MARS,
      globe: new Globe(MARS),
      // Render the planet immediately; missing root DEM tiles must not
      // prevent the whole globe (and its NASA imagery) from appearing.
      terrainProvider: new EllipsoidTerrainProvider({ ellipsoid: MARS }),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      selectionIndicator: false,
      infoBox: false,
      fullscreenButton: false,
    })

    viewer.clock.shouldAnimate = true
    setMapViewer(viewer)
    viewer.scene.globe.baseColor = Color.fromCssColorString('#9b6547')
    let terrainLoadId = 0
    const loadTerrain = async () => {
      const id = ++terrainLoadId
      setTerrainStatus('loading')
      let timer: number | undefined
      try {
        await Promise.race([
          Promise.all([terrainProvider.requestTileGeometry(0, 0, 0), terrainProvider.requestTileGeometry(1, 0, 0)]),
          new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('DEM startup timeout')), 8000) }),
        ])
        if (viewer.isDestroyed() || id !== terrainLoadId) return
        viewer.terrainProvider = terrainProvider
        setTerrainStatus('ready')
      } catch {
        if (!viewer.isDestroyed() && id === terrainLoadId) setTerrainStatus('fallback')
      } finally { window.clearTimeout(timer) }
    }
    retryTerrainRef.current = () => { void loadTerrain() }
    void loadTerrain()
    viewer.scene.globe.showGroundAtmosphere = false
    viewer.scene.globe.depthTestAgainstTerrain = true
    viewer.scene.globe.maximumScreenSpaceError = 2
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
    ;(viewer.camera.frustum as PerspectiveFrustum).fov = CesiumMath.toRadians(
      55,
    )
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false

    // Visible, illustrative surface weather. It follows the active asset and
    // is independent of the derived regional screening values.
    const weatherFx: WeatherFx = createWeatherFx(viewer)
    const weatherModelColor = new Color(1, 1, 1, 1)
    const applyWeatherTint = (model: Model) => {
      const tint = weatherFx.tint
      weatherModelColor.red = tint.color[0]
      weatherModelColor.green = tint.color[1]
      weatherModelColor.blue = tint.color[2]
      model.colorBlendMode = ColorBlendMode.MIX
      model.color = weatherModelColor
      model.colorBlendAmount = tint.amount
    }

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(77.7, 18.4, 10_000_000, MARS),
    })

    // --- Imagery layers: NASA base imagery + MOLA-derived slope overlay ---
    const baseProviders: Record<BaseLayerId, () => ImageryProvider> = {
      'mola-hillshade': () => createTrekProvider(MOLA_SHADE),
      viking: () => createTrekProvider(VIKING),
    }
    let currentBase: ImageryLayer | null = null
    let slopeOverlay: ImageryLayer | null = null
    const applyBase = (id: BaseLayerId) => {
      if (viewer.isDestroyed()) return
      if (currentBase) viewer.imageryLayers.remove(currentBase, true)
      currentBase = viewer.imageryLayers.addImageryProvider(
        baseProviders[id](),
        0,
      )
    }
    const applySlope = (on: boolean) => {
      if (viewer.isDestroyed()) return
      if (on && !slopeOverlay) {
        slopeOverlay = viewer.imageryLayers.addImageryProvider(
          createSlopeOverlayProvider(),
        )
      } else if (!on && slopeOverlay) {
        viewer.imageryLayers.remove(slopeOverlay, true)
        slopeOverlay = null
      }
    }
    applyBase(useLayerStore.getState().base)
    applySlope(useLayerStore.getState().slope)
    const unsubscribeLayers = useLayerStore.subscribe((state, previous) => {
      if (state.base !== previous.base) applyBase(state.base)
      if (state.slope !== previous.slope) applySlope(state.slope)
    })

    const siteEntities: ReturnType<Viewer['entities']['add']>[] = []
    fetch('/api/sites')
      .then((response) => (response.ok ? response.json() : []))
      .then((sites: SiteInfo[]) => {
        if (viewer.isDestroyed()) return
        for (const site of sites) {
          siteEntities.push(
            viewer.entities.add({
              id: `astra-site-${site.name}`,
              position: Cartesian3.fromDegrees(site.lon, site.lat, 0, MARS),
              point: {
                pixelSize: 6,
                color: Color.fromCssColorString('#ffd166'),
                outlineColor: Color.BLACK,
                outlineWidth: 1,
                heightReference: HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              label: {
                text: site.name,
                font: '600 18px sans-serif',
                fillColor: Color.WHITE,
                showBackground: true,
                backgroundColor: Color.fromCssColorString('#00000099'),
                pixelOffset: new Cartesian2(0, -14),
                verticalOrigin: VerticalOrigin.BOTTOM,
                heightReference: HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                scaleByDistance: new NearFarScalar(1.0e4, 1.0, 1.0e7, 0.85),
              },
            }),
          )
        }
      })
      .catch(() => {})

    // --- Live atmospheric layer: REMS station pin on the globe ---
    fetch('/api/weather/station')
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error(String(response.status))),
      )
      .then((station: StationInfo) => {
        if (viewer.isDestroyed()) return
        const temps =
          station.min_temp_c !== null && station.max_temp_c !== null
            ? `${Math.round(station.min_temp_c)}…${Math.round(station.max_temp_c)} °C · `
            : ''
        const pressure =
          station.pressure_pa !== null
            ? `${Math.round(station.pressure_pa)} Pa`
            : ''
        viewer.entities.add({
          id: 'astra-rems-station',
          position: Cartesian3.fromDegrees(station.lon, station.lat, 0, MARS),
          point: {
            pixelSize: 8,
            color: Color.fromCssColorString('#34d399'),
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `${station.station_name} REMS · sol ${station.sol ?? '—'} · ${temps}${pressure}`,
            font: '11px sans-serif',
            fillColor: Color.fromCssColorString('#d1fae5'),
            showBackground: true,
            backgroundColor: Color.fromCssColorString('#022c22cc'),
            pixelOffset: new Cartesian2(0, -16),
            verticalOrigin: VerticalOrigin.BOTTOM,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      })
      .catch(() => {})

    let scoutModel: Model | null = null
    let activeVehicleModel = vehicleModel('rover')
    let surfaceCrew: SurfaceCrew | null = null
    let parkedSev: Model | null = null
    let scoutFrame = 0
    let scoutToken = 0
    let scoutGrounded = false
    let driveSurface: ReturnType<typeof createDriveSurface> | null = null
    let wheelDust: ReturnType<typeof createWheelDust> | null = null
    let chaseActive = false
    let chaseHandler: ScreenSpaceEventHandler | null = null
    let chaseKeydown: ((event: KeyboardEvent) => void) | null = null
    /** Electrical-spark particle systems at a crash wreck. */
    let crashParticles: ParticleSystem[] = []
    let particleTexture: HTMLCanvasElement | null = null
    /** Jagged arc-bolt polylines flickering over the wreck. */
    let sparkBolts: Entity[] = []
    let sparkTimer: number | null = null
    let scanSeconds = 0
    let animationLast = performance.now()
    const removeAnimationClock = viewer.scene.preUpdate.addEventListener(() => {
      const now = performance.now()
      const dt = Math.min(0.1, Math.max(0, (now - animationLast) / 1000))
      animationLast = now
      const drive = useDriveStore.getState()
      if (scoutModel?.ready && !drive.loading && !drive.crash && drive.speedMps < 0.02) scanSeconds += dt
      // The weather layer advances with the render clock, even when no asset
      // is moving, so an event can fade in before the drive starts.
      const weather = useWeatherStore.getState()
      weather.tick(now)
      weatherFx.update(now, weather.kind, weatherElapsedS(weather.startedAt, now))
      if (scoutModel?.ready) applyWeatherTint(scoutModel)
      if (parkedSev?.ready) applyWeatherTint(parkedSev)
    })

    const destroyChaseControls = () => {
      if (chaseHandler) {
        chaseHandler.destroy()
        chaseHandler = null
      }
      if (chaseKeydown) {
        window.removeEventListener('keydown', chaseKeydown)
        chaseKeydown = null
      }
    }

    const removeScout = (preserveCrew = false) => {
      if (!preserveCrew) {
        surfaceCrew?.destroy()
        surfaceCrew = null
        if (parkedSev && !parkedSev.isDestroyed()) viewer.scene.primitives.remove(parkedSev)
        parkedSev = null
      }
      scanSeconds = 0
      roverViewRef.current = null
      weatherFx.clearAnchor()
      wheelDust?.destroy()
      wheelDust = null
      driveSurface?.destroy()
      driveSurface = null
      scoutGrounded = false
      scoutToken += 1
      chaseActive = false
      viewer.scene.screenSpaceCameraController.enableInputs = true
      destroyChaseControls()
      if (scoutFrame) cancelAnimationFrame(scoutFrame)
      scoutFrame = 0
      if (scoutModel) {
        viewer.scene.primitives.remove(scoutModel)
        scoutModel = null
      }
      removeCrashEffects()
      viewer.entities.removeById('astra-scout')
      useDriveStore.getState().end()
      useDriveStore.getState().crashed(null)
      useDriveStore.getState().update({ completion: 'idle', missionPhase: 'aboard', crewMessage: '' })
      if (import.meta.env.DEV) {
        delete (globalThis as unknown as Record<string, unknown>).__astraScout
        delete (globalThis as unknown as Record<string, unknown>).__astraChase
        if (!preserveCrew) delete (globalThis as unknown as Record<string, unknown>).__astraCrew
      }
    }

    /** Remove the wreck's electrical-arc effects, if any. */
    const removeCrashEffects = () => {
      if (sparkTimer !== null) {
        window.clearInterval(sparkTimer)
        sparkTimer = null
      }
      for (const bolt of sparkBolts) {
        viewer.entities.remove(bolt)
      }
      sparkBolts = []
      for (const system of crashParticles) {
        viewer.scene.primitives.remove(system)
      }
      crashParticles = []
    }

    /**
     * Spawn the wreck's electrical arcing at a crash position: jagged
     * lightning-like bolts flickering over the wreck plus point-like spark
     * spatter that falls ballistically under Mars gravity. Combustion
     * cannot happen in Mars' thin CO₂ atmosphere, so the rover failure is
     * shown as electrical discharge from the wrecked power bus — still a
     * scout-simulation dramatization, not a physical model.
     */
    const spawnSparks = (position: Cartesian3) => {
      particleTexture ??= makeParticleTexture()
      const frame = Transforms.eastNorthUpToFixedFrame(position, MARS)

      // Spark spatter: tiny hard-edged dots spat in every direction and
      // pulled down by Mars gravity, shrinking as they cool. A fire plume
      // grows soft blobs upward; sparks are points that drop.
      const gravityStep = Cartesian3.multiplyByScalar(
        MARS.geodeticSurfaceNormal(position, new Cartesian3()),
        -CRASH.sparkGravityMs2,
        new Cartesian3(),
      )
      const sparks = new ParticleSystem({
        modelMatrix: Matrix4.clone(frame),
        emitter: new SphereEmitter(0.35),
        emissionRate: CRASH.sparkBasePerS,
        bursts: SPARK_CRACKLE_S.map(
          (time) =>
            new ParticleBurst({
              time,
              minimum: CRASH.sparkBurstMin,
              maximum: CRASH.sparkBurstMax,
            }),
        ),
        minimumParticleLife: 0.2,
        maximumParticleLife: 0.55,
        minimumSpeed: 4,
        maximumSpeed: 11,
        startScale: 1.0,
        endScale: 0.35,
        minimumImageSize: new Cartesian2(0.12, 0.12),
        maximumImageSize: new Cartesian2(0.22, 0.22),
        sizeInMeters: true,
        image: particleTexture,
        startColor: Color.fromCssColorString('#f0f9ff').withAlpha(1.0),
        endColor: Color.fromCssColorString('#3b82f6').withAlpha(0.0),
        lifetime: 60,
        updateCallback: (particle: Particle, dt: number) => {
          particle.velocity = Cartesian3.add(
            particle.velocity,
            Cartesian3.multiplyByScalar(gravityStep, dt, new Cartesian3()),
            new Cartesian3(),
          )
        },
      })
      viewer.scene.primitives.add(sparks)
      crashParticles.push(sparks)

      // Jagged arc bolts: randomly regenerated discharge paths that flash
      // on and off with dark gaps between flashes — the look that separates
      // arcing from burning. Runs on its own interval so the wreck keeps
      // crackling even after the drive loop ends, until cleanup.
      const jaggedPath = (): Cartesian3[] => {
        const segments =
          SPARK_BOLT.minSegments +
          Math.floor(
            Math.random() *
              (SPARK_BOLT.maxSegments - SPARK_BOLT.minSegments + 1),
          )
        const points: Cartesian3[] = []
        let x = (Math.random() * 2 - 1) * 0.7
        let y = (Math.random() * 2 - 1) * 0.7
        let z = 0.25 + Math.random() * 0.5
        for (let index = 0; index <= segments; index++) {
          points.push(
            Matrix4.multiplyByPoint(
              frame,
              new Cartesian3(x, y, z),
              new Cartesian3(),
            ),
          )
          x += (Math.random() * 2 - 1) * SPARK_BOLT.radiusM * 0.4
          y += (Math.random() * 2 - 1) * SPARK_BOLT.radiusM * 0.4
          z = Math.max(
            0.15,
            Math.min(3.2, z + (Math.random() * 2 - 0.7) * SPARK_BOLT.radiusM * 0.25),
          )
        }
        return points
      }
      for (let index = 0; index < SPARK_BOLT.count; index++) {
        sparkBolts.push(
          viewer.entities.add({
            id: `astra-spark-bolt-${index}`,
            polyline: {
              positions: jaggedPath(),
              width: SPARK_BOLT.width,
              material: new PolylineGlowMaterialProperty({
                glowPower: 0.22,
                color: Color.fromCssColorString('#dbeafe'),
              }),
              show: false,
            },
          }),
        )
      }
      let visibleUntilMs = 0
      let nextAtMs = 0
      sparkTimer = window.setInterval(() => {
        const now = performance.now()
        if (now < visibleUntilMs) return
        const visible = now >= nextAtMs
        for (const bolt of sparkBolts) {
          const polyline = bolt.polyline
          if (!polyline) continue
          if (visible) {
            polyline.positions = new ConstantProperty(jaggedPath())
          }
          polyline.show = new ConstantProperty(visible)
        }
        if (visible) {
          visibleUntilMs = now + SPARK_BOLT.onMs
          nextAtMs =
            visibleUntilMs +
            SPARK_BOLT.offMinMs +
            Math.random() * (SPARK_BOLT.offMaxMs - SPARK_BOLT.offMinMs)
        }
      }, SPARK_BOLT.tickMs)
    }

    const terrainHeightAt = (lon: number, lat: number): number | undefined => {
      const cached = terrainProvider.cachedHeight(lon, lat)
      const rendered = viewer.scene.globe.getHeight(Cartographic.fromDegrees(lon, lat))
      if (rendered !== undefined && Number.isFinite(rendered)) {
        return cached !== undefined ? Math.max(cached, rendered) : rendered
      }
      return cached
    }

    const wheelHeightAt = (point: Cartographic) =>
      terrainProvider.cachedHeight(CesiumMath.toDegrees(point.longitude), CesiumMath.toDegrees(point.latitude))
      ?? viewer.scene.globe.getHeight(point)

    const removeLabelLayout = declutterLabels(viewer, terrainHeightAt)

    // Recheck immediately before each Cesium render, including when paused
    // or stopped: tile refinement must not rise through an idle rover.
    let crewIdleTime = performance.now()
    const removeGrounding = viewer.scene.preRender.addEventListener(() => {
      const now = performance.now()
      const controls = useDriveStore.getState()
      if (surfaceCrew && (!controls.active || controls.missionPhase === 'rover-approach')) {
        const heading = roverViewRef.current?.heading ?? 0
        surfaceCrew.setWeather(weatherFx.rollForHeading(heading), weatherFx.tint)
        surfaceCrew.update(document.hidden || controls.paused ? 0 : Math.min(0.1, (now - crewIdleTime) / 1000), 0)
      }
      crewIdleTime = now
      if (parkedSev?.ready) {
        const lift = contactLift(parkedSev.modelMatrix, wheelHeightAt, vehicleModel('sev').contacts)
        if (lift > 0.001) {
          const position = Matrix4.getTranslation(parkedSev.modelMatrix, new Cartesian3())
          const normal = MARS.geodeticSurfaceNormal(position, new Cartesian3())
          Matrix4.setTranslation(parkedSev.modelMatrix, Cartesian3.add(position, Cartesian3.multiplyByScalar(normal, lift, normal), position), parkedSev.modelMatrix)
        }
      }
      if (!scoutGrounded || !scoutModel?.ready) return
      const matrix = scoutModel.modelMatrix
      const lift = contactLift(matrix, wheelHeightAt, activeVehicleModel.contacts)
      if (lift <= 0) return
      const position = MARS.cartesianToCartographic(Matrix4.getTranslation(matrix, new Cartesian3()))
      position.height += lift
      scoutModel.modelMatrix = Matrix4.setTranslation(matrix, MARS.cartographicToCartesian(position), new Matrix4())
    })

    /**
     * Prefer the actual rendered mesh, with corridor and route-profile
     * fallbacks while tiles load. Footprint collision is resolved after
     * body rotation, rather than lifting everything to a coarse envelope.
     */
    const groundAt = (
      sample: RouteSample,
      corridor: ((distanceKm: number) => number | undefined) | null,
    ): number => {
      const terrain = terrainHeightAt(sample.lon, sample.lat)
      // Contact must follow the visible mesh, including its depressions.
      // Taking max(mesh, interpolated corridor) bridges valleys and floats.
      if (terrain !== undefined && Number.isFinite(terrain)) return terrain
      const dense = corridor ? corridor(sample.distanceKm) : undefined
      return dense !== undefined && Number.isFinite(dense) ? dense : sample.elevationM
    }

    /**
     * Highest known terrain reference under the camera, along the line of
     * sight toward the rover, and the route-profile ground at the rover
     * (`floorHint`, always available, used when terrain tiles around the
     * camera have not streamed in yet). Keeping camera poses above this
     * floor stops the camera from clipping into landforms while orbiting
     * and driving — even when a ridge sits between the camera and the
     * rover. Returns -Infinity when nothing is known, in which case
     * callers skip the clamp.
     */
    const cameraFloorM = (
      cameraPosition: Cartesian3,
      target: Cartesian3,
      floorHint: number,
    ): number => {
      const heights: number[] = []
      const sample = (cartesian: Cartesian3) => {
        const carto = MARS.cartesianToCartographic(cartesian)
        const height = terrainHeightAt(CesiumMath.toDegrees(carto.longitude), CesiumMath.toDegrees(carto.latitude))
        if (height !== undefined && Number.isFinite(height)) heights.push(height)
      }
      sample(cameraPosition)
      const towardTarget = Cartesian3.subtract(
        target,
        cameraPosition,
        new Cartesian3(),
      )
      for (const fraction of [0.35, 0.6, 0.85]) {
        sample(
          Cartesian3.add(
            cameraPosition,
            Cartesian3.multiplyByScalar(
              towardTarget,
              fraction,
              new Cartesian3(),
            ),
            new Cartesian3(),
          ),
        )
      }
      if (Number.isFinite(floorHint)) heights.push(floorHint)
      return heights.length ? Math.max(...heights) : -Infinity
    }

    /**
     * Local terrain normal in east-north-up coordinates, from a 4-point
     * MOLA surface probe. Falls back to straight up when the terrain tiles
     * around the point are not loaded yet.
     */
    const terrainNormalAt = (lon: number, lat: number): Cartesian3 => {
      const dLat = TERRAIN_SAMPLE_M / METERS_PER_DEG
      const cosLat = Math.max(0.1, Math.cos((lat * Math.PI) / 180))
      const dLon = TERRAIN_SAMPLE_M / (METERS_PER_DEG * cosLat)
      const east = terrainHeightAt(lon + dLon, lat)
      const west = terrainHeightAt(lon - dLon, lat)
      const north = terrainHeightAt(lon, lat + dLat)
      const south = terrainHeightAt(lon, lat - dLat)
      if (
        east === undefined ||
        west === undefined ||
        north === undefined ||
        south === undefined
      ) {
        return new Cartesian3(0, 0, 1)
      }
      const dzDe = (east - west) / (2 * TERRAIN_SAMPLE_M)
      const dzDn = (north - south) / (2 * TERRAIN_SAMPLE_M)
      return Cartesian3.normalize(
        new Cartesian3(-dzDe, -dzDn, 1),
        new Cartesian3(),
      )
    }

    /** Clamp a terrain normal so the rover never tilts past the cap. */
    const limitTilt = (up: Cartesian3): Cartesian3 => {
      const normalized = Cartesian3.normalize(up, new Cartesian3())
      const tilt = Math.acos(Math.min(1, Math.max(-1, normalized.z)))
      if (tilt <= ROVER_MAX_TILT_RAD || tilt === 0) return normalized
      const scale = Math.tan(ROVER_MAX_TILT_RAD) / Math.tan(tilt)
      return Cartesian3.normalize(
        new Cartesian3(
          normalized.x * scale,
          normalized.y * scale,
          normalized.z,
        ),
        new Cartesian3(),
      )
    }

    /**
     * Rover model matrix: keeps the model heading along the travel
     * direction, tilts the body onto the local terrain plane, and adds a
     * suspension pitch kick (positive = nose up) from vertical acceleration.
     * `clearance` lifts the origin above the ground plane, growing with the
     * body tilt so corners do not dig into slopes. `roll` rotates the body
     * around its forward axis — used by the crash simulation to tumble.
     */
    const roverMatrix = (
      position: Cartesian3,
      bearing: number,
      up: Cartesian3,
      tilt: number,
      clearance: number,
      roll = 0,
    ): Matrix4 => {
      const horizontal = new Cartesian3(
        Math.sin(bearing),
        Math.cos(bearing),
        0,
      )
      const alongUp = Cartesian3.multiplyByScalar(
        up,
        Cartesian3.dot(horizontal, up),
        new Cartesian3(),
      )
      let forward = Cartesian3.normalize(
        Cartesian3.subtract(horizontal, alongUp, new Cartesian3()),
        new Cartesian3(),
      )
      let bodyUp = Cartesian3.normalize(up, new Cartesian3())
      if (tilt !== 0) {
        const cos = Math.cos(tilt)
        const sin = Math.sin(tilt)
        const tiltedUp = Cartesian3.normalize(
          Cartesian3.add(
            Cartesian3.multiplyByScalar(bodyUp, cos, new Cartesian3()),
            Cartesian3.multiplyByScalar(forward, sin, new Cartesian3()),
            new Cartesian3(),
          ),
          new Cartesian3(),
        )
        const tiltedForward = Cartesian3.normalize(
          Cartesian3.subtract(
            Cartesian3.multiplyByScalar(forward, cos, new Cartesian3()),
            Cartesian3.multiplyByScalar(bodyUp, sin, new Cartesian3()),
            new Cartesian3(),
          ),
          new Cartesian3(),
        )
        bodyUp = tiltedUp
        forward = tiltedForward
      }
      if (roll !== 0) {
        // Rotate the body up-vector around the forward axis; the cross
        // term is orthogonal to both when the frame is orthonormal.
        const cos = Math.cos(roll)
        const sin = Math.sin(roll)
        bodyUp = Cartesian3.normalize(
          Cartesian3.add(
            Cartesian3.multiplyByScalar(bodyUp, cos, new Cartesian3()),
            Cartesian3.multiplyByScalar(
              Cartesian3.cross(forward, bodyUp, new Cartesian3()),
              sin,
              new Cartesian3(),
            ),
            new Cartesian3(),
          ),
          new Cartesian3(),
        )
      }
      const right = Cartesian3.cross(bodyUp, forward, new Cartesian3())
      const rotation = new Matrix3(
        forward.x,
        right.x,
        bodyUp.x,
        forward.y,
        right.y,
        bodyUp.y,
        forward.z,
        right.z,
        bodyUp.z,
      )
      const local = Matrix4.fromRotationTranslation(
        rotation,
        new Cartesian3(0, 0, clearance),
      )
      return Matrix4.multiplyTransformation(
        Transforms.eastNorthUpToFixedFrame(position, MARS),
        local,
        new Matrix4(),
      )
    }

    /**
     * A third-person camera pose behind `position`, looking ahead along
     * `bearing`, lifted above the terrain by `margin`. Used by the
     * traverse preview scrubber. `floorHint` is the known ground height at
     * `position` (from the route profile), used to keep the camera above
     * landforms even before terrain tiles stream in.
     */
    const poseBehind = (
      position: Cartesian3,
      bearing: number,
      opts: PoseOptions,
      floorHint: number,
    ) => {
      const frame = Transforms.eastNorthUpToFixedFrame(position, MARS)
      let cameraPosition = Matrix4.multiplyByPoint(
        frame,
        new Cartesian3(
          -Math.sin(bearing) * opts.distance,
          -Math.cos(bearing) * opts.distance,
          opts.height,
        ),
        new Cartesian3(),
      )
      const lookAhead = Matrix4.multiplyByPoint(
        frame,
        new Cartesian3(
          Math.sin(bearing) * opts.lookAhead,
          Math.cos(bearing) * opts.lookAhead,
          opts.targetHeight,
        ),
        new Cartesian3(),
      )
      const floor = cameraFloorM(cameraPosition, position, floorHint)
      if (Number.isFinite(floor)) {
        const cameraCarto = MARS.cartesianToCartographic(cameraPosition)
        if (cameraCarto.height < floor + opts.margin) {
          cameraCarto.height = floor + opts.margin
          cameraPosition = MARS.cartographicToCartesian(cameraCarto)
        }
      }
      const direction = Cartesian3.normalize(
        Cartesian3.subtract(lookAhead, cameraPosition, new Cartesian3()),
        new Cartesian3(),
      )
      const up = MARS.geodeticSurfaceNormal(cameraPosition, new Cartesian3())
      return {
        destination: cameraPosition,
        orientation: { direction, up },
      }
    }

    /**
     * Orbit chase-camera pose. The camera is placed relative to `anchor`
     * (which tracks the rover horizontally but rides a smoothed height, so
     * suspension bumps never shake the lens) and always looks at `aim` (the
     * rover), keeping it centered on screen. The user's drag controls
     * yaw/pitch offsets and scroll controls distance; the pose is lifted
     * above the terrain floor (camera position, line-of-sight samples, and
     * route-profile ground via `floorHint`) so landforms stay solid.
     */
    const orbitPose = (
      anchor: Cartesian3,
      aim: Cartesian3,
      bearing: number,
      orbit: OrbitState,
      floorHint: number,
      stabilizeHeight?: (desired: number, minimum: number) => number,
    ) => {
      const frame = Transforms.eastNorthUpToFixedFrame(anchor, MARS)
      const heading = bearing + orbit.yaw
      const cosPitch = Math.cos(orbit.pitch)
      let cameraPosition = Matrix4.multiplyByPoint(
        frame,
        new Cartesian3(
          -Math.sin(heading) * cosPitch * orbit.distance,
          -Math.cos(heading) * cosPitch * orbit.distance,
          Math.sin(orbit.pitch) * orbit.distance,
        ),
        new Cartesian3(),
      )
      const floor = cameraFloorM(cameraPosition, anchor, floorHint)
      const cameraCarto = MARS.cartesianToCartographic(cameraPosition)
      const minimum = Number.isFinite(floor) ? floor + ORBIT.margin : cameraCarto.height
      const originalHeight = cameraCarto.height
      cameraCarto.height = stabilizeHeight
        ? stabilizeHeight(originalHeight, minimum)
        : Math.max(originalHeight, minimum)
      cameraPosition = MARS.cartographicToCartesian(cameraCarto)
      // Move the aim with the camera's collision correction. Otherwise
      // every terrain-floor adjustment pitches the lens toward the rover.
      const aimCarto = MARS.cartesianToCartographic(aim)
      aimCarto.height += cameraCarto.height - originalHeight
      const stabilizedAim = MARS.cartographicToCartesian(aimCarto)
      const direction = Cartesian3.normalize(
        Cartesian3.subtract(stabilizedAim, cameraPosition, new Cartesian3()),
        new Cartesian3(),
      )
      const up = MARS.geodeticSurfaceNormal(cameraPosition, new Cartesian3())
      return {
        destination: cameraPosition,
        orientation: { direction, up },
      }
    }

    const setPreviewMarkerVisible = (visible: boolean) => {
      const marker = viewer.entities.getById('astra-preview')
      if (marker) marker.show = visible
    }

    /**
     * Move the preview marker (and optionally the camera) to fraction `t`
     * of the selected traverse (safe or hazardous). The camera glides
     * behind the marker through 3D terrain, and the user can still
     * orbit/zoom freely between scrub events.
     */
    const updatePreview = (
      route: RouteData,
      t: number,
      moveCamera: boolean,
    ) => {
      const choice = useAppStore.getState().routeChoice
      const traverse = selectTraverse(route, choice)
      if (!traverse) return
      const sample = sampleRoute(traverse, t)
      const ground = terrainHeightAt(sample.lon, sample.lat)
      const position = Cartesian3.fromDegrees(
        sample.lon,
        sample.lat,
        0,
        MARS,
      )
      const marker = viewer.entities.getById('astra-preview')
      if (marker) {
        marker.position = new ConstantPositionProperty(position)
        if (marker.label) {
          marker.label.text = new ConstantProperty(
            `Preview · ${sample.distanceKm.toFixed(1)} km`,
          )
        }
      }
      if (!moveCamera) return
      const cameraGround = ground ?? sample.elevationM
      const cameraTarget = Cartesian3.fromDegrees(
        sample.lon,
        sample.lat,
        cameraGround,
        MARS,
      )
      viewer.camera.flyTo({
        ...poseBehind(cameraTarget, sample.bearing, PREVIEW, cameraGround),
        duration: 0.3,
      })
    }

    const clearRoute = () => {
      removeScout()
      for (const id of [
        'astra-route',
        'astra-route-start',
        'astra-route-end',
        'astra-route-label',
        'astra-preview',
        'astra-hazardous',
        'astra-hazardous-label',
      ]) {
        viewer.entities.removeById(id)
      }
      // Danger pins are drawn per route with generated ids.
      for (const entity of [...viewer.entities.values]) {
        if (
          typeof entity.id === 'string' &&
          entity.id.startsWith('astra-danger-')
        ) {
          viewer.entities.remove(entity)
        }
      }
    }

    const startScout = async (route: RouteData, deploymentT?: number) => {
      const deploying = deploymentT !== undefined
      removeScout(deploying)
      scoutGrounded = true
      useDriveStore.getState().start()
      setPreviewMarkerVisible(false)
      const token = ++scoutToken
      // The scout drives whichever traverse the user selected: the safe
      // (planner-approved) route or the hazardous direct comparison,
      // falling back to the safe route when no comparison exists.
      const choice = useAppStore.getState().routeChoice
      const hazardous = choice === 'hazardous' ? route.hazardous : null
      const traverse: TraversableRoute = hazardous ?? route
      const assignment = assignVehicle(hazardous ?? route, route.slope_limit_deg, route.crew_estimate?.profile)
      const plan = planCrewMission(hazardous ?? route, route.slope_limit_deg, assignment.vehicle)
      if (!deploying && !plan.available) {
        useDriveStore.getState().end()
        useDriveStore.getState().update({ completion: 'risk-hold', missionPhase: 'hold', crewMessage: plan.reason })
        useAppStore.getState().setRoutePhase('preview')
        setPreviewMarkerVisible(true)
        return
      }
      const vehicle = deploying ? 'rover' : 'sev'
      activeVehicleModel = vehicleModel(vehicle)
      const cameraScale = activeVehicleModel.cameraScale
      useDriveStore.getState().update({ vehicle, completion: 'idle', missionPhase: deploying ? 'rover-approach' : 'aboard', crewMessage: plan.reason })
      const initialT = deploymentT ?? 0
      const destinationT = deploying ? 1 : plan.stagingT
      const startSample = sampleRoute(traverse, initialT)
      roverViewRef.current = { position: Cartesian3.fromDegrees(startSample.lon, startSample.lat, groundAt(startSample, null), MARS), heading: startSample.bearing, terrainProvider }
      useDriveStore.getState().update({ totalKm: traverse.distance_km })
      const dangers = hazardous ? hazardous.dangers : (route.dangers ?? [])
      viewer.entities.add({
        id: 'astra-scout',
        position: Cartesian3.fromDegrees(
          traverse.coordinates[0]?.[0] ?? 0,
          traverse.coordinates[0]?.[1] ?? 0,
          0,
          MARS,
        ),
        point: {
          pixelSize: 7,
          color: Color.CYAN,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${deploying ? 'Robotic rover' : 'SEV · crew of 3 aboard'} · simulated`,
          font: '11px sans-serif',
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#001018cc'),
          pixelOffset: new Cartesian2(0, -20),
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })

      // Fire the corridor pre-sample in parallel with the model load: it
      // warms the /api/dem/tile HTTP cache the globe will hit during the
      // drive and gives the rover mesh-consistent ground heights.
      const corridorPromise = presampleCorridor(traverse, terrainProvider)

      try {
        const model = await Model.fromGltfAsync({
          url: activeVehicleModel.url,
          // A fixed physical scale is essential for terrain contact.
          scale: 1,
          modelMatrix: Transforms.eastNorthUpToFixedFrame(
            Cartesian3.fromDegrees(startSample.lon, startSample.lat, groundAt(startSample, null) + ROVER_GROUND_CLEARANCE, MARS), MARS,
          ),
        })
        if (token !== scoutToken) {
          model.destroy()
          return
        }
        viewer.scene.primitives.add(model)
        scoutModel = model
        if (import.meta.env.DEV) {
          ;(globalThis as unknown as Record<string, unknown>).__astraScout =
            model
        }
        const prepareAnimation = async () => {
          if (!model.ready) {
            await new Promise<void>((resolve) => {
              const remove = model.readyEvent.addEventListener(() => {
                remove()
                resolve()
              })
            })
          }
          if (token !== scoutToken) return
          if (vehicle === 'sev') return // Supplied SEV is static; no rover mast/manipulator clips.
          const deploymentStart = performance.now()
          let deploymentProgress = 0
          try {
            model.activeAnimations.add({
              name: 'ArmatureAction',
              loop: ModelAnimationLoop.NONE,
              multiplier: 2,
              animationTime: () => {
                if (!useDriveStore.getState().crash) deploymentProgress = Math.min(1, (performance.now() - deploymentStart) / 7500)
                return deploymentProgress
              },
            })
          } catch {
            try {
              model.activeAnimations.add({
                index: 6,
                loop: ModelAnimationLoop.NONE,
              })
            } catch {
              // The clip is optional; the scout marker still moves.
            }
          }
          // The supplied GLB has mast/manipulator clips, but no wheel-spin
          // clip. Deploy the mast once; scan only while stationary. Leave
          // manipulator deployment stowed during all traverses and crashes.
          try {
            model.activeAnimations.add({
              name: 'topAction', loop: ModelAnimationLoop.REPEAT,
              animationTime: () => (scanSeconds % 20) / 20,
            })
          } catch { /* model variants may omit mast scanning */ }
        }
        await prepareAnimation()
      } catch (error) {
        console.warn(`${assignment.label} model failed to load; using marker only.`, error)
      }

      const corridor = await corridorPromise
      if (token !== scoutToken) return

      const startGround = groundAt(startSample, corridor)
      driveSurface = createDriveSurface(viewer, traverse)
      wheelDust = createWheelDust(viewer)
      driveSurface.update(startSample.distanceKm * 1000, performance.now())
      const start = Cartesian3.fromDegrees(
        startSample.lon,
        startSample.lat,
        startGround,
        MARS,
      )
      let bearing = startSample.bearing
      let up = terrainNormalAt(startSample.lon, startSample.lat)

      const orbit: OrbitState = {
        yaw: 0,
        pitch: ORBIT.defaultPitch,
        distance: ORBIT.defaultDistance * cameraScale,
        dragging: false,
      }
      /** Look-at point: mast height above the rover, slightly ahead along
       *  the heading so the view shows the terrain being driven into. */
      const aimPoint = (position: Cartesian3, heading: number) => {
        const frame = Transforms.eastNorthUpToFixedFrame(position, MARS)
        return Matrix4.multiplyByPoint(
          frame,
          new Cartesian3(
            Math.sin(heading) * CHASE.aimLeadM,
            Math.cos(heading) * CHASE.aimLeadM,
            activeVehicleModel.aimHeight,
          ),
          new Cartesian3(),
        )
      }

      // Teleport into the chase pose (offset ~30 m up along the surface
      // normal), then swoop down into place. A single flyTo from the route
      // overview would interpolate across kilometers of terrain and clip
      // through Mount Sharp; the swoop path stays within 30 m of the
      // already terrain-clamped chase position.
      const introPose = orbitPose(
        start,
        aimPoint(start, bearing),
        bearing,
        orbit,
        startGround,
      )
      viewer.camera.setView({
        destination: Cartesian3.add(
          introPose.destination,
          Cartesian3.multiplyByScalar(
            MARS.geodeticSurfaceNormal(introPose.destination, new Cartesian3()),
            30,
            new Cartesian3(),
          ),
          new Cartesian3(),
        ),
        orientation: introPose.orientation,
      })
      await new Promise<void>((resolve) => {
        viewer.camera.flyTo({
          ...introPose,
          duration: 1.2,
          complete: () => resolve(),
          cancel: () => resolve(),
        })
      })
      if (token !== scoutToken) return
      chaseActive = true
      viewer.scene.screenSpaceCameraController.enableInputs = false

      // Game-style camera controls while driving: drag to orbit, scroll to
      // zoom. The default camera controller is disabled during the chase.
      chaseHandler = new ScreenSpaceEventHandler(viewer.canvas)
      chaseHandler.setInputAction(() => {
        orbit.dragging = true
      }, ScreenSpaceEventType.LEFT_DOWN)
      chaseHandler.setInputAction(() => {
        orbit.dragging = false
      }, ScreenSpaceEventType.LEFT_UP)
      chaseHandler.setInputAction(
        (movement: ScreenSpaceEventHandler.MotionEvent) => {
          if (!orbit.dragging) return
          const dx = movement.endPosition.x - movement.startPosition.x
          const dy = movement.endPosition.y - movement.startPosition.y
          orbit.yaw -= dx * ORBIT.dragYawPerPx
          orbit.pitch = Math.min(
            ORBIT.maxPitch,
            Math.max(ORBIT.minPitch, orbit.pitch + dy * ORBIT.dragPitchPerPx),
          )
        },
        ScreenSpaceEventType.MOUSE_MOVE,
      )
      chaseHandler.setInputAction((delta: number) => {
        orbit.distance = Math.min(
          ORBIT.maxDistance * cameraScale,
          Math.max(
            ORBIT.minDistance * cameraScale,
            orbit.distance * (delta > 0 ? 1.15 : 0.87),
          ),
        )
      }, ScreenSpaceEventType.WHEEL)

      // Keyboard drive controls: speed multiplier, pause, camera recenter,
      // early exit. Skipped while typing in the chat box.
      let speedMult = 1
      let paused = false
      const isTypingTarget = (target: EventTarget | null): boolean =>
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'BUTTON' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      chaseKeydown = (event: KeyboardEvent) => {
        if (!chaseActive || isTypingTarget(event.target)) return
        if (useDriveStore.getState().braking &&
          (KEYS.speedUp.includes(event.code) || KEYS.slowDown.includes(event.code))) {
          event.preventDefault()
          return
        }
        if (KEYS.speedUp.includes(event.code)) {
          speedMult = Math.min(SPEED_MAX, speedMult * SPEED_STEP)
        } else if (KEYS.slowDown.includes(event.code)) {
          speedMult = Math.max(SPEED_MIN, speedMult / SPEED_STEP)
        } else if (KEYS.pause.includes(event.code)) {
          if (event.repeat) return
          useDriveStore.getState().togglePause()
          event.preventDefault()
          return
        } else if (KEYS.recenter.includes(event.code)) {
          orbit.yaw = 0
          orbit.pitch = ORBIT.defaultPitch
          orbit.distance = ORBIT.defaultDistance * cameraScale
        } else if (KEYS.end.includes(event.code)) {
          useDriveStore.getState().stop()
          event.preventDefault()
          return
        } else {
          return
        }
        event.preventDefault()
        useDriveStore.getState().update({ speedMult })
      }
      window.addEventListener('keydown', chaseKeydown)

      const totalKm =
        traverse.profile[traverse.profile.length - 1]?.distance_km ?? 0
      // Physical metres per simulated second, independent of route length.
      let distanceM = initialT * totalKm * 1000
      let velocityMps = 0
      let lastFrame = performance.now()
      let lastHudPush = 0
      let lastT = initialT
      // Suspension state: smoothed body height over the sampled terrain.
      let bodyHeight = startGround
      let verticalSpeed = 0
      let tiltSmooth = 0
      // Camera state: height rides its own slow spring (never the
      // suspension), while horizontal position tracks the rover rigidly.
      let cameraHeight = startGround
      let cameraBearing = bearing
      let eyeHeight = MARS.cartesianToCartographic(introPose.destination).height
      let eyeOffset = eyeHeight - startGround

      const updateChaseCamera = (sample: RouteSample, ground: number, dt: number) => {
        cameraHeight += (ground - cameraHeight) * (1 - Math.exp(-CHASE.heightSpringPerS * dt))
        // Follow the hill's baseline immediately, smoothing only small bumps.
        // An absolute-height lag on a fast uphill traverse sends the lens
        // above the rover when collision clearance catches up.
        cameraHeight = Math.max(ground - 0.3, Math.min(ground + 0.3, cameraHeight))
        cameraBearing += wrapPi(bearing - cameraBearing) * (1 - Math.exp(-CHASE.cameraHeadingPerS * dt))
        cameraBearing = bearing + Math.max(-0.25, Math.min(0.25, wrapPi(cameraBearing - bearing)))
        const anchor = Cartesian3.fromDegrees(sample.lon, sample.lat, cameraHeight, MARS)
        viewer.camera.setView(orbitPose(
          anchor,
          // The lens targets its own stable frame, never the rover's
          // suspension/contact position (including during a tumble).
          aimPoint(anchor, cameraBearing),
          cameraBearing,
          orbit,
          ground,
          (desired, minimum) => {
            const target = Math.max(desired, minimum + 0.35) - cameraHeight
            eyeOffset += (target - eyeOffset) * (1 - Math.exp(-CHASE.eyeHeightPerS * dt))
            // Headroom absorbs small bumps; a real obstacle still takes
            // priority, with a damped descent once it is behind the camera.
            eyeOffset = Math.max(eyeOffset, minimum - cameraHeight)
            eyeHeight = cameraHeight + eyeOffset
            return eyeHeight
          },
        ))
      }

      /** Shared cleanup for both natural completion and an Esc abort. */
      const endDrive = (completion: 'arrived' | 'stopped' | 'risk-hold' = 'stopped') => {
        surfaceCrew?.stop()
        wheelDust?.stop()
        scoutFrame = 0
        chaseActive = false
        destroyChaseControls()
        viewer.scene.screenSpaceCameraController.enableInputs = true
        useDriveStore.getState().end()
        useDriveStore.getState().update({ completion, missionPhase: completion === 'arrived' ? 'complete' : 'hold' })
        // Keep the preview marker where the drive stopped. Syncing
        // subscribedPreviewT stops the store subscription from treating
        // this as a scrub event and flying the camera away.
        subscribedPreviewT = lastT
        const store = useAppStore.getState()
        store.setPreviewT(lastT)
        store.setRoutePhase('preview')
        setPreviewMarkerVisible(true)
      }

      const handoff = async () => {
        wheelDust?.stop()
        useDriveStore.getState().update({ missionPhase: 'disembarking', loading: true, speedMps: 0, arriving: false })
        try {
          const crew = await createSurfaceCrew(viewer, traverse, plan.stagingT,
            sample => groundAt(sample, corridor), () => token !== scoutToken)
          if (token !== scoutToken || !crew) { crew?.destroy(); return }
          surfaceCrew = crew
          if (import.meta.env.DEV) (globalThis as unknown as Record<string, unknown>).__astraCrew = crew
        } catch (error) {
          if (token !== scoutToken) return
          console.error('Crew model loading failed', error)
          useDriveStore.getState().update({ crewMessage: 'Crew models could not load. Mission held at staging; retry to reload.' })
          endDrive('risk-hold')
          return
        }
        useDriveStore.getState().update({ loading: false })
        let previous = performance.now()
        const crewStep = (now: number) => {
          if (token !== scoutToken || !surfaceCrew) return
          const controls = useDriveStore.getState()
          const dt = document.hidden || controls.paused ? 0 : Math.min(0.1, (now - previous) / 1000) * controls.speedMult
          previous = now
          if (controls.stopRequested) { endDrive(); return }
          if (controls.jumpRequested) { surfaceCrew.jump(); useDriveStore.setState({ jumpRequested: false }) }
          // The crew walks at the assumed pace. The suit/equipment allowance is
          // a planning-time factor for the EVA estimate, not a walking-speed cut.
          const pace = route.crew_estimate?.profile?.pace_m_s ?? 0.5
          surfaceCrew.setWeather(weatherFx.rollForHeading(bearing), weatherFx.tint)
          surfaceCrew.update(dt, pace)
          if (surfaceCrew.mode === 'hold') {
            if (assignment.vehicle === 'rover') {
              // Preserve the parked carrier and three crew members during rover launch.
              parkedSev = scoutModel
              scoutModel = null
              void startScout(route, plan.stagingT)
              return
            }
            surfaceCrew.walk()
            useDriveStore.getState().update({ missionPhase: 'crew-approach' })
          }
          lastT = surfaceCrew.fraction
          const sample = sampleRoute(traverse, lastT)
          const ground = groundAt(sample, corridor)
          weatherFx.setAnchor(Cartesian3.fromDegrees(sample.lon, sample.lat, ground, MARS))
          // Stop the final approach if newly rendered terrain exceeds the crew limit.
          const ahead = sampleRoute(traverse, Math.min(1, lastT + 0.001 / Math.max(totalKm, 0.001)))
          const grade = Math.abs(CesiumMath.toDegrees(Math.atan2(groundAt(ahead, corridor) - ground,
            Math.max(0.01, (ahead.distanceKm - sample.distanceKm) * 1000))))
          if (surfaceCrew.mode === 'walk' && (Math.abs(sample.gradeDeg) > route.slope_limit_deg || grade > route.slope_limit_deg)) {
            useDriveStore.getState().update({ crewMessage: 'Crew held: final-approach grade exceeds the mission limit.' })
            endDrive('risk-hold')
            return
          }
          bearing = sample.bearing
          updateChaseCamera(sample, ground, Math.max(0.001, dt))
          useDriveStore.getState().update({ distanceKm: sample.distanceKm, speedMps: controls.paused ? 0 : surfaceCrew.mode === 'walk' ? surfaceCrew.speedMps : 0, timeScale: 1 })
          useAppStore.getState().setPreviewT(lastT)
          if (surfaceCrew.mode === 'complete') { endDrive('arrived'); return }
          scoutFrame = requestAnimationFrame(crewStep)
        }
        scoutFrame = requestAnimationFrame(crewStep)
      }

      useDriveStore.getState().update({
        loading: false,
        totalKm,
        distanceKm: startSample.distanceKm,
        limitDeg: route.slope_limit_deg,
      })

      // ---- Crash simulation (genuine cliffs only) ----
      // The crewed SEV halts when the live grade passes the mission slope
      // envelope (max(12°, limit + 0.25°), matching the backend danger
      // classification). The auto-deployed rover does not topple on a bare
      // over-limit grade; it only falls when it reaches a genuine cliff — a
      // planner-classified cliff zone or terrain that has become cliff-steep
      // (>= 35°). It then tumbles downhill with decaying bounces and arcs
      // electrically. Thresholds are calibrated to real MOLA grades (the
      // steepest Mars terrain reaches ~25° at MOLA resolution); the sparks are
      // a dramatization.
      const rolloverGradeDeg = Math.max(
        CRASH.minRolloverGradeDeg,
        route.slope_limit_deg + CRASH.gradeOverLimitDeg,
      )
      type CrashState = {
        type: 'rollover' | 'fall' | 'jet'
        detail: string
        origin: RouteSample
        body: CrashBody
        arcing: boolean
        wreckTime: number
      }
      let crash: CrashState | null = null

      const beginCrash = (type: 'rollover' | 'fall' | 'jet', sample: RouteSample) => {
        scoutGrounded = false
        wheelDust?.stop()
        if (type === 'jet') wheelDust?.jet(Cartesian3.fromDegrees(sample.lon, sample.lat, groundAt(sample, corridor), MARS))
        const absGrade = Math.abs(sample.gradeDeg)
        const probe = (offset: number) => groundAt({ ...sample,
          lon: sample.lon + Math.sin(bearing) * offset / (METERS_PER_DEG * Math.max(0.1, Math.cos(sample.lat * Math.PI / 180))),
          lat: sample.lat + Math.cos(bearing) * offset / METERS_PER_DEG,
          distanceKm: sample.distanceKm + offset / 1000,
        }, corridor)
        const localRise = probe(2) - probe(-2)
        const downhill = (Math.abs(localRise) > 0.01 ? localRise : sample.gradeDeg) < 0 ? 1 : -1
        const initialPitch = -Math.atan2(localRise, 4)
        const detail =
          type === 'jet'
            ? 'Training-only CO₂ jet impulse: Mars-gravity flight and inelastic landing. No jet is observed at this route location.'
            : type === 'fall'
            ? `Fell at km ${sample.distanceKm.toFixed(1)} — ${absGrade.toFixed(0)}° cliff drop; impact and electrical discharge.`
            : `Rollover at km ${sample.distanceKm.toFixed(1)} — ${absGrade.toFixed(0)}° grade exceeded the mission slope envelope.`
        crash = {
          type,
          detail,
          origin: sample,
          body: { x: 0, z: terrainSupport(0, initialPitch, probe) + 0.03,
            vx: type === 'jet' ? velocityMps : downhill * 0.8,
            vz: type === 'jet' ? 7.5 : 0,
            pitch: initialPitch, spin: type === 'jet' ? 0.8 : downhill * 4,
            elapsed: 0, settledFor: 0, impacts: 0 },
          arcing: false,
          wreckTime: 0,
        }
        const store = useDriveStore.getState()
        store.update({ paused: false, braking: false, speedMps: 0 })
        store.crashed({
          type,
          detail,
          distanceKm: sample.distanceKm,
          gradeDeg: sample.gradeDeg,
        })
      }

      /** Animate the crash; returns false when the drive has ended. */
      const stepCrash = (dt: number): boolean => {
        const state = crash
        if (!state) return false
        const atOffset = (x: number): RouteSample => ({ ...state.origin,
          lon: state.origin.lon + Math.sin(bearing) * x / (METERS_PER_DEG * Math.max(0.1, Math.cos(state.origin.lat * Math.PI / 180))),
          lat: state.origin.lat + Math.cos(bearing) * x / METERS_PER_DEG,
          distanceKm: state.origin.distanceKm + x / 1000,
        })
        advanceCrash(state.body, dt, x => groundAt(atOffset(x), corridor))
        const sample = atOffset(state.body.x)
        const ground = groundAt(sample, corridor)
        const position = Cartesian3.fromDegrees(
          sample.lon,
          sample.lat,
          state.body.z,
          MARS,
        )
        if (scoutModel) {
          // Rotate about the body centre, not the wheel-plane origin.
          const matrix = roverMatrix(
            position,
            bearing,
            Cartesian3.UNIT_Z,
            state.body.pitch,
            0,
          )
          scoutModel.modelMatrix = Matrix4.multiplyByTranslation(matrix, new Cartesian3(0, 0, -1), new Matrix4())
          applyWeatherTint(scoutModel)
        }
        weatherFx.setAnchor(position)
        roverViewRef.current = { position, heading: bearing, terrainProvider }
        const scout = viewer.entities.getById('astra-scout')
        if (scout) scout.position = new ConstantPositionProperty(position)

        if (chaseActive) {
          if (!orbit.dragging) {
            orbit.yaw *= Math.exp(-ORBIT.recenterPerS * dt)
          }
          updateChaseCamera(sample, Math.max(ground, state.body.z - bodySupport(state.body.pitch)), dt)
        }

        if (
          !state.arcing &&
          state.body.settledFor >= 0.8
        ) {
          state.arcing = true
          state.wreckTime = state.body.elapsed
          spawnSparks(position)
          useDriveStore.getState().update({ distanceKm: sample.distanceKm })
        }
        if (
          state.arcing &&
          state.body.elapsed - state.wreckTime >= CRASH.holdAfterCrashMs / 1000
        ) {
          endDrive()
          // Recover onto the safe route when the wreck was on the
          // hazardous comparison, so the safety story lands.
          const store = useAppStore.getState()
          if (store.routeChoice !== 'safe' && route.hazardous) {
            store.setRouteChoice('safe')
          }
          return false
        }
        return true
      }

      const step = (now: number) => {
        if (token !== scoutToken) return
        if (crash && useDriveStore.getState().stopRequested) {
          endDrive()
          return
        }
        const wallDt = document.hidden ? 0 : Math.min(1, Math.max(0, (now - lastFrame) / 1000))
        const dt = Math.min(0.1, Math.max(0.001, wallDt))
        lastFrame = now
        if (crash) {
          if (stepCrash(dt)) scoutFrame = requestAnimationFrame(step)
          return
        }
        const controls = useDriveStore.getState()
        paused = controls.paused
        speedMult = controls.speedMult
        const timeScale = controls.travelMode === 'preview'
          ? Math.max(1, totalKm * 1000 / (90 * SCOUT_CRUISE_MPS))
          : 1
        const wantsHalt = paused || controls.stopRequested
        // Presentation dynamics stay bounded even for a long traverse preview.
        const suspensionDt = wantsHalt && velocityMps === 0 ? 0 : dt * speedMult
        const ahead = sampleRoute(traverse, Math.min(1, lastT + 0.005 / Math.max(totalKm, 0.005)))
        const here = sampleRoute(traverse, lastT)
        const probeDistanceM = Math.max(0.01, (ahead.distanceKm - here.distanceKm) * 1000)
        const localGrade = CesiumMath.toDegrees(Math.atan2(
          groundAt(ahead, corridor) - groundAt(here, corridor), probeDistanceM,
        ))
        const gradeFactor = 1 / (1 + Math.max(Math.abs(ahead.gradeDeg), Math.abs(localGrade)) / 8)
        const turn = Math.abs(wrapPi(ahead.bearing - bearing))
        const remainingM = Math.max(0, destinationT * totalKm * 1000 - distanceM)
        const targetSpeed = wantsHalt ? 0 : Math.min(
          SCOUT_CRUISE_MPS * gradeFactor / (1 + turn * 3),
          arrivalSpeedLimit(remainingM, timeScale * speedMult, velocityMps, wallDt),
        )
        const motion = advanceDrive(velocityMps, targetSpeed, wallDt)
        velocityMps = motion.speed
        distanceM = Math.min(destinationT * totalKm * 1000, distanceM + motion.distance * timeScale * speedMult)
        if (!wantsHalt && remainingM < 0.01) distanceM = destinationT * totalKm * 1000
        const braking = wantsHalt && velocityMps > 0
        if (braking !== controls.braking) useDriveStore.getState().update({ braking })
        const t = totalKm > 0 ? distanceM / (totalKm * 1000) : 1
        lastT = t
        const sample = sampleRoute(traverse, t)
        const ground = groundAt(sample, corridor)
        if (controls.jetRequested && vehicle === 'rover') {
          beginCrash('jet', sample)
          scoutFrame = requestAnimationFrame(step)
          return
        }

        driveSurface?.update(distanceM, now)

        // Suspension affects attitude; the wheel envelope stays grounded.
        const previousVerticalSpeed = verticalSpeed
        // Fixed-size spring integration gives the same suspension response
        // at different frame rates and playback speeds. Downward free-fall
        // is bounded by Mars gravity rather than an arbitrary camera ease.
        const substeps = Math.max(1, Math.ceil(suspensionDt * 120))
        const h = suspensionDt / substeps
        for (let index = 0; index < substeps; index++) {
          const omega = SUSPENSION.springPerS
          const acceleration = Math.max(-3.71,
            omega * omega * (ground - bodyHeight) - 2 * omega * verticalSpeed)
          verticalSpeed += acceleration * h
          bodyHeight += verticalSpeed * h
        }
        // Wheels follow the surface directly; suspension changes attitude,
        // never pushes the wheel plane beneath the ground or leaves it airborne.
        let rideHeight = ground
        const accel = suspensionDt > 0 ? (verticalSpeed - previousVerticalSpeed) / suspensionDt : 0
        const tiltRaw = Math.max(
          -SUSPENSION.maxTiltRad,
          Math.min(SUSPENSION.maxTiltRad, accel * SUSPENSION.tiltGain),
        )
        // Smooth the pitch kick so DEM/LOD height jumps cannot snap it.
        tiltSmooth +=
          (tiltRaw - tiltSmooth) * (1 - Math.exp(-SUSPENSION.tiltSmoothPerS * dt))

        const position = Cartesian3.fromDegrees(
          sample.lon,
          sample.lat,
          rideHeight,
          MARS,
        )
        // Smooth heading toward the route bearing, taking the short way
        // around the circle (wrapPi; the old inline modulo expression
        // returned -pi for a zero delta and spun the heading backward).
        bearing +=
          wrapPi(sample.bearing - bearing) * (1 - Math.exp(-CHASE.headingPerS * dt))
        up = Cartesian3.lerp(
          up,
          terrainNormalAt(sample.lon, sample.lat),
          1 - Math.exp(-CHASE.normalPerS * dt),
          new Cartesian3(),
        )
        up = limitTilt(up)
        // Slope-aware ground clearance: on steep tilts the capped body
        // normal keeps the nose/tail corners from digging into the hill.
        const clearance =
          ROVER_GROUND_CLEARANCE + (1 - up.z) * TILT_CLEARANCE_M
        const weatherRoll = weatherFx.rollForHeading(bearing)
        if (scoutModel) {
          let matrix = roverMatrix(
            position,
            bearing,
            up,
            tiltSmooth,
            clearance,
            weatherRoll,
          )
          // Dense contact envelope from the GLB's actual wheel bounds. Apply
          // collision correction AFTER tilt/suspension, so a lagging body
          // normal cannot push the uphill wheels through a ridge.
          const lift = contactLift(matrix, wheelHeightAt, activeVehicleModel.contacts)
          if (lift > 0) {
            rideHeight += lift
            bodyHeight = Math.max(bodyHeight, rideHeight)
            verticalSpeed = Math.max(0, verticalSpeed)
            Cartesian3.fromDegrees(sample.lon, sample.lat, rideHeight, MARS, position)
            matrix = roverMatrix(position, bearing, up, tiltSmooth, clearance, weatherRoll)
          }
          scoutModel.modelMatrix = matrix
          applyWeatherTint(scoutModel)
          wheelDust?.update(matrix, velocityMps)
        }
        weatherFx.setAnchor(position)
        roverViewRef.current = { position, heading: bearing, terrainProvider }
        const scout = viewer.entities.getById('astra-scout')
        if (scout) scout.position = new ConstantPositionProperty(position)

        if (chaseActive) {
          // Recenter behind the rover when the user is not dragging.
          if (!orbit.dragging) {
            orbit.yaw *= Math.exp(-ORBIT.recenterPerS * dt)
            orbit.pitch +=
              (ORBIT.defaultPitch - orbit.pitch) *
              (1 - Math.exp(-ORBIT.recenterPerS * 0.6 * dt))
          }
          updateChaseCamera(sample, ground, dt)
        }
        // Throttled telemetry: the HUD, route-panel readouts, scrubber, and
        // elevation-chart cursor all track the drive live. Passing a
        // non-fatal danger zone raises the amber slip-risk banner.
        if (now - lastHudPush > 200 || (wantsHalt && velocityMps === 0 && controls.speedMps !== 0)) {
          lastHudPush = now
          const zone = dangers.find(
            (candidate) =>
              Math.abs(sample.distanceKm - candidate.distance_km) <=
              candidate.span_km / 2 + 0.25,
          )
          useDriveStore.getState().warn(zone ? zone.label : null)
          useDriveStore.getState().update({
            distanceKm: sample.distanceKm,
            gradeDeg: sample.gradeDeg,
            elevationM: sample.elevationM,
            headingDeg: (CesiumMath.toDegrees(bearing) + 360) % 360,
            speedMult,
            paused,
            speedMps: velocityMps,
            braking,
            arriving: !wantsHalt && targetSpeed < SCOUT_CRUISE_MPS * gradeFactor / (1 + turn * 3),
            timeScale,
          })
          useAppStore.getState().setPreviewT(t)
        }
        if (import.meta.env.DEV) {
          ;(globalThis as unknown as Record<string, unknown>).__astraChase = {
            bearing,
            distance: orbit.distance,
            pitch: orbit.pitch,
            yaw: orbit.yaw,
            cameraHeight,
            roverRideHeight: rideHeight,
            ground,
          }
        }
        if (controls.stopRequested && velocityMps === 0) {
          endDrive()
          return
        }
        // Crash triggers: beginCrash reports the failure and takes over the
        // loop — stepCrash owns every frame from the next one on.
        const absGrade = Math.abs(sample.gradeDeg)
        // The crewed SEV never risks the crew: it halts at the slope envelope.
        if (vehicle === 'sev' && absGrade >= rolloverGradeDeg) {
          endDrive('risk-hold')
          return
        }
        // The auto-deployed rover is a deliberate robotic approach, so it
        // tolerates ordinary over-limit grades and only topples against a
        // genuine landform: a planner-classified cliff zone (a near-vertical
        // MOLA drop it can fall off or smash into), or terrain that has become
        // cliff-steep. A bare over-limit grade is not a topple cause, so on an
        // otherwise hazardous-but-navigable traverse the rover reaches the
        // target. The topple only occurs when the user chose this unsafe route
        // over the planner's safe traverse.
        if (topplesAtCliff(absGrade, sample.distanceKm, dangers, CRASH.fallGradeDeg)) {
          beginCrash('fall', sample)
          scoutFrame = requestAnimationFrame(step)
          return
        }
        // Arrival is judged on distance, not on the recomputed fraction:
        // destinationT * totalKm * 1000 can fail to round-trip through
        // distanceM / (totalKm * 1000), leaving `t < destinationT` true forever.
        if (remainingM > 0.01 || wantsHalt) {
          scoutFrame = requestAnimationFrame(step)
        } else {
          if (deploying) endDrive('arrived')
          else void handoff()
        }
      }
      scoutFrame = requestAnimationFrame(step)
    }

    const unregister = onCommand('fly_to', async (payload) => {
      const lon = Number(payload.lon)
      const lat = Number(payload.lat)
      const height = Number(payload.height ?? 250_000)
      const duration = Number(payload.duration ?? 1.6)
      if (![lon, lat, height, duration].every(Number.isFinite)) {
        throw new Error('fly_to requires numeric lon/lat')
      }
      useAppStore.getState().clearSite()
      viewer.entities.removeById('astra-landing')
      clearRoute()
      await new Promise<void>((resolve) => {
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(lon, lat, height, MARS),
          duration,
          complete: () => resolve(),
          cancel: () => resolve(),
        })
      })
    })

    const unregisterConditions = onCommand('show_conditions', (payload) => {
      useAppStore.getState().setConditions(conditionsSchema.parse(payload))
    })

    const unregisterBriefing = onCommand('show_briefing', (payload) => {
      const briefing = briefingSchema.parse(payload)
      useAppStore.getState().setBriefing(briefing)
      viewer.entities.removeById('astra-landing')
      if (!briefing.landing) return
      viewer.entities.add({
        id: 'astra-landing',
        position: Cartesian3.fromDegrees(
          briefing.landing.lon,
          briefing.landing.lat,
          0,
          MARS,
        ),
        point: {
          pixelSize: 9,
          color: Color.CYAN,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: briefing.landing.name,
          font: '12px sans-serif',
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#000000aa'),
          pixelOffset: new Cartesian2(0, -18),
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
    })

    const unregisterRoute = onCommand('show_route', async (payload) => {
      const route = routeSchema.parse(payload)
      if (route.coordinates.length < 3) {
        throw new Error('show_route requires at least 3 points')
      }
      clearRoute()
      useAppStore.getState().setRoute(route)

      // Route, pins, labels, and markers are clamped to the live terrain, so
      // they never sink when higher-detail MOLA tiles stream in.
      const positions = Cartesian3.fromDegreesArray(
        route.coordinates.flatMap(([lon, lat]) => [lon, lat]),
        MARS,
      )

      viewer.entities.add({
        id: 'astra-route',
        polyline: {
          positions,
          width: 7,
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.18,
            color: Color.fromCssColorString('#ff8a3d'),
          }),
          clampToGround: true,
        },
      })

      const pin = (
        id: string,
        lon: number,
        lat: number,
        color: Color,
        text: string,
      ) =>
        viewer.entities.add({
          id,
          position: Cartesian3.fromDegrees(lon, lat, 0, MARS),
          point: {
            pixelSize: 11,
            color,
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text,
            font: '600 17px sans-serif',
            fillColor: Color.WHITE,
            showBackground: true,
            backgroundColor: Color.fromCssColorString('#000000cc'),
            pixelOffset: new Cartesian2(0, -20),
            verticalOrigin: VerticalOrigin.BOTTOM,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })

      const first = route.coordinates[0] ?? [0, 0]
      const last = route.coordinates[route.coordinates.length - 1] ?? first
      pin('astra-route-start', first[0], first[1], Color.LIME, route.start)
      pin('astra-route-end', last[0], last[1], Color.ORANGE, route.end)

      const mid = sampleRoute(route, 0.55)
      const verdict = route.slope_compliant ? 'Safest route' : 'Direct route'
      viewer.entities.add({
        id: 'astra-route-label',
        position: Cartesian3.fromDegrees(mid.lon, mid.lat, 0, MARS),
        label: {
          text: `${verdict} · ${route.distance_km.toFixed(1)} km · max ${route.max_grade_deg.toFixed(1)}°`,
          font: '12px sans-serif',
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#2a1608dd'),
          pixelOffset: new Cartesian2(0, 24),
          verticalOrigin: VerticalOrigin.TOP,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })

      // Hazardous comparison route: the direct profile the planner
      // rejected. Drawn dashed red so the compliant detour reads clearly
      // against it, with its own danger pins along the way.
      if (route.hazardous && route.hazardous.coordinates.length >= 3) {
        viewer.entities.add({
          id: 'astra-hazardous',
          polyline: {
            positions: Cartesian3.fromDegreesArray(
              route.hazardous.coordinates.flatMap(([lon, lat]) => [lon, lat]),
              MARS,
            ),
            width: 5,
            material: new PolylineDashMaterialProperty({
              color: Color.fromCssColorString('#ef4444'),
              dashLength: 14,
            }),
            clampToGround: true,
          },
        })
        const hazardousMid = sampleRoute(route.hazardous, 0.5)
        const zoneCount = route.hazardous.dangers.length
        viewer.entities.add({
          id: 'astra-hazardous-label',
          position: Cartesian3.fromDegrees(
            hazardousMid.lon,
            hazardousMid.lat,
            0,
            MARS,
          ),
          label: {
            text: `Direct route · ${route.hazardous.distance_km.toFixed(1)} km · max ${route.hazardous.max_grade_deg.toFixed(1)}° · ${zoneCount} danger zone${zoneCount === 1 ? '' : 's'}`,
            font: '12px sans-serif',
            fillColor: Color.fromCssColorString('#fecaca'),
            showBackground: true,
            backgroundColor: Color.fromCssColorString('#450a0add'),
            pixelOffset: new Cartesian2(0, 44),
            verticalOrigin: VerticalOrigin.TOP,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      }

      const dangerColor = (type: RouteDanger['type']): Color =>
        type === 'cliff'
          ? Color.fromCssColorString('#ef4444')
          : type === 'rollover'
            ? Color.fromCssColorString('#f97316')
            : Color.fromCssColorString('#facc15')

      const dangerPin = (id: string, zone: RouteDanger) =>
        viewer.entities.add({
          id,
          position: Cartesian3.fromDegrees(zone.lon, zone.lat, 0, MARS),
          point: {
            pixelSize: zone.type === 'steep' ? 9 : 13,
            color: dangerColor(zone.type),
            outlineColor: Color.BLACK,
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `${zone.type === 'cliff' ? 'CRITICAL' : zone.type === 'rollover' ? 'HIGH' : 'MODERATE'} · ${zone.max_grade_deg.toFixed(1)}°\n${zone.label} · km ${zone.distance_km.toFixed(1)}`,
            font: '600 16px sans-serif',
            fillColor: Color.WHITE,
            showBackground: true,
            backgroundColor: Color.fromCssColorString('#1c0a00cc'),
            pixelOffset: new Cartesian2(0, -18),
            verticalOrigin: VerticalOrigin.BOTTOM,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })

      // Danger pins on both traverses: the safe route shows what it avoids
      // (usually nothing over the limit), the direct route shows why.
      ;(route.dangers ?? []).forEach((zone, index) => {
        dangerPin(`astra-danger-safe-${index}`, zone)
      })
      ;(route.hazardous?.dangers ?? []).forEach((zone, index) => {
        dangerPin(`astra-danger-hazardous-${index}`, zone)
      })

      // Scrubbable preview marker: sits at the start until the user drags
      // the traverse slider or plays the simulation.
      viewer.entities.add({
        id: 'astra-preview',
        position: Cartesian3.fromDegrees(first[0], first[1], 0, MARS),
        point: {
          pixelSize: 9,
          color: Color.fromCssColorString('#22d3ee'),
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: 'Preview · 0.0 km',
          font: '11px sans-serif',
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#04222bcc'),
          pixelOffset: new Cartesian2(0, -22),
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })

      // Frame the whole traverse first: the traceroute preview starts from
      // an overview, then the slider drags the camera along the route in 3D.
      const sphere = BoundingSphere.fromPoints(positions)
      await new Promise<void>((resolve) => {
        viewer.camera.flyToBoundingSphere(sphere, {
          duration: 1.6,
          offset: new HeadingPitchRange(
            0,
            -Math.PI / 3,
            Math.max(sphere.radius * 2.4, 30_000),
          ),
          complete: () => resolve(),
          cancel: () => resolve(),
        })
      })
    })

    // React to the traverse preview scrubber and the simulation play button.
    let subscribedPhase: RoutePhase = 'idle'
    let subscribedPreviewT = 0
    let subscribedRoute = useAppStore.getState().route
    let subscribedChoice = useAppStore.getState().routeChoice
    const unsubscribeStore = useAppStore.subscribe((state) => {
      const route = state.route
      if (route !== subscribedRoute || state.routeChoice !== subscribedChoice) {
        subscribedRoute = route
        subscribedChoice = state.routeChoice
        removeScout()
      }
      if (!route) subscribedPhase = 'idle'
      if (!route || viewer.isDestroyed()) return
      if (state.routePhase !== subscribedPhase) {
        const previous = subscribedPhase
        subscribedPhase = state.routePhase
        if (state.routePhase === 'simulating') {
          void startScout(route)
          return
        }
        if (previous === 'simulating') {
          // Simulation finished: leave the camera where it stopped, but
          // bring the preview marker back at the scrubber position.
          updatePreview(route, state.previewT, false)
        }
      }
      if (
        state.routePhase === 'preview' &&
        state.previewT !== subscribedPreviewT
      ) {
        subscribedPreviewT = state.previewT
        updatePreview(route, state.previewT, true)
      }
    })

    // Loading has no animation loop yet; cancel it synchronously instead
    // of letting start() erase a Stop request after the awaits finish.
    const unsubscribeDrive = useDriveStore.subscribe((state) => {
      if (state.stopRequested && state.loading) {
        viewer.camera.cancelFlight()
        removeScout()
        setPreviewMarkerVisible(true)
        useAppStore.getState().setRoutePhase('preview')
      }
    })

    if (import.meta.env.DEV) {
      ;(globalThis as unknown as Record<string, unknown>).__astraViewer =
        viewer
      ;(globalThis as unknown as Record<string, unknown>).__astraWeather =
        weatherFx
      ;(globalThis as unknown as Record<string, unknown>).__astraProbe = (
        lon: number,
        lat: number,
      ) => {
        const cartographic =
          viewer.scene.globe.ellipsoid.cartesianToCartographic(
            Cartesian3.fromDegrees(lon, lat, 0, MARS),
          )
        return viewer.scene.globe.getHeight(cartographic) ?? null
      }
    }

    return () => {
      terrainLoadId++
      removeAnimationClock()
      removeLabelLayout()
      removeGrounding()
      unsubscribeDrive()
      unsubscribeStore()
      unsubscribeLayers()
      unregister()
      unregisterConditions()
      unregisterBriefing()
      unregisterRoute()
      clearRoute()
      viewer.entities.removeById('astra-landing')
      viewer.entities.removeById('astra-rems-station')
      for (const entity of siteEntities) {
        viewer.entities.remove(entity)
      }
      weatherFx.destroy()
      if (import.meta.env.DEV) {
        delete (globalThis as unknown as Record<string, unknown>).__astraViewer
        delete (globalThis as unknown as Record<string, unknown>).__astraWeather
        delete (globalThis as unknown as Record<string, unknown>).__astraProbe
        delete (globalThis as unknown as Record<string, unknown>).__astraScout
        delete (globalThis as unknown as Record<string, unknown>).__astraChase
      }
      viewer.destroy()
    }
  }, [])

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      <LayerPanel terrainStatus={terrainStatus} onRetryTerrain={() => retryTerrainRef.current()} />
      <DriveHud />
      {mapViewer && !mapViewer.isDestroyed() && <MapExplorer viewer={mapViewer} />}
      {mapViewer && !mapViewer.isDestroyed() && <EnvironmentOverlay viewer={mapViewer} />}
      <RoverCameraWindow poseRef={roverViewRef} />
    </>
  )
}
