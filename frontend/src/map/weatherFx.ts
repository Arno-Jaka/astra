import {
  BoxEmitter,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  Entity,
  Matrix4,
  Particle,
  ParticleSystem,
  PolylineGlowMaterialProperty,
  Transforms,
  Viewer,
} from 'cesium'
import { MARS } from './trek'
import {
  WEATHER_ENTITY_PREFIX,
  weatherIntensity,
  weatherLeanRad,
  weatherTint,
  type WeatherKind,
  type WeatherTint,
} from '../store/weatherEngine'

/** Weather particles are only drawn once the camera is down near the
 *  surface; a regional/global view would otherwise fill the screen with
 *  meaningless meter-scale grit. */
const SURFACE_CAMERA_MAX_M = 4_500
/** Re-anchor to the camera when it has been dragged far from the asset. */
const MAX_ANCHOR_DISTANCE_M = 3_000
const VORTEX_ENTITY_COUNT = 3
const BOLT_ENTITY_COUNT = 3
const BOLT_ON_MS = 95
const BOLT_MIN_GAP_MS = 380
const BOLT_MAX_GAP_MS = 1_250

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

function makeSoftDisc(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.55)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  return canvas
}

function makeFogBlob(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,0.5)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.28)')
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.09)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  return canvas
}

function makeIceStreak(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 64
  const context = canvas.getContext('2d')!
  const gradient = context.createLinearGradient(0, 0, 0, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,0)')
  gradient.addColorStop(0.25, 'rgba(235,248,255,0.95)')
  gradient.addColorStop(0.75, 'rgba(220,242,255,0.8)')
  gradient.addColorStop(1, 'rgba(220,242,255,0)')
  context.fillStyle = gradient
  context.fillRect(6, 0, 4, 64)
  context.fillStyle = 'rgba(255,255,255,0.85)'
  context.beginPath()
  context.ellipse(8, 32, 5, 20, 0, 0, Math.PI * 2)
  context.fill()
  return canvas
}

/**
 * Visible, simulated surface weather around the crew and vehicles.
 *
 * The layer is illustrative, not a measured atmosphere: sand walls, a dust
 * tornado, electrostatic dry lightning, CO₂ ice streaks and ice fog are
 * invented visual events used to make the weathering of the 3D assets read.
 * Particle colour, wind speed and event duration are artistic values, not a
 * forecast or a physical Mars weather model.
 */
export function createWeatherFx(viewer: Viewer) {
  const softDisc = makeSoftDisc()
  const fogBlob = makeFogBlob()
  const iceStreak = makeIceStreak()

  const systems: ParticleSystem[] = []
  const addSystem = (system: ParticleSystem) => {
    viewer.scene.primitives.add(system)
    systems.push(system)
    return system
  }

  // Shared mutable wind vector in each system's local east-north-up frame.
  let windX = 0
  let windY = 0
  let kind: WeatherKind = 'clear'
  let elapsedS = 0
  let intensity = 0
  let tint: WeatherTint = weatherTint('clear', 0)
  let windAzimuthRad = 0.7
  let visible = false

  /** Emission rate multipliers, scaled by the event intensity each frame. */
  const sand = addSystem(new ParticleSystem({
    modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
    show: false,
    emitter: new BoxEmitter(new Cartesian3(130, 130, 26)),
    emissionRate: 0,
    minimumSpeed: 1.5,
    maximumSpeed: 7,
    minimumParticleLife: 2.4,
    maximumParticleLife: 5.2,
    startScale: 0.9,
    endScale: 6.5,
    image: softDisc,
    imageSize: new Cartesian2(0.45, 0.45),
    sizeInMeters: true,
    startColor: new Color(0.72, 0.55, 0.36, 0.36),
    endColor: new Color(0.6, 0.44, 0.28, 0),
    updateCallback: (particle: Particle, dt: number) => {
      // Let the grit pick up the ambient wind instead of flying radially.
      const response = Math.min(1, dt * 1.9)
      particle.velocity.x += (windX - particle.velocity.x) * response
      particle.velocity.y += (windY - particle.velocity.y) * response
      particle.velocity.z -= 3.71 * dt * 0.16
    },
  }))

  const tornado = addSystem(new ParticleSystem({
    modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
    show: false,
    emitter: new BoxEmitter(new Cartesian3(12, 12, 3)),
    emissionRate: 0,
    minimumSpeed: 0.5,
    maximumSpeed: 3,
    minimumParticleLife: 2.2,
    maximumParticleLife: 4,
    startScale: 0.8,
    endScale: 5.5,
    image: softDisc,
    imageSize: new Cartesian2(0.42, 0.42),
    sizeInMeters: true,
    startColor: new Color(0.66, 0.5, 0.33, 0.42),
    endColor: new Color(0.55, 0.39, 0.25, 0),
    updateCallback: (particle: Particle, dt: number) => {
      const x = particle.position.x
      const y = particle.position.y
      const radius = Math.hypot(x, y) + 0.4
      // Fast tangential motion plus a gentle inward pull makes a funnel.
      const swirl = (13 + 20 * intensity) / Math.sqrt(Math.max(1.5, radius))
      particle.velocity.x = (-y / radius) * swirl - x * 0.42
      particle.velocity.y = (x / radius) * swirl - y * 0.42
      particle.velocity.z = 2.1 + 2.6 * intensity
      particle.velocity.z -= 0.15 * dt
    },
  }))

  const charge = addSystem(new ParticleSystem({
    modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
    show: false,
    emitter: new BoxEmitter(new Cartesian3(110, 110, 24)),
    emissionRate: 0,
    minimumSpeed: 1,
    maximumSpeed: 5,
    minimumParticleLife: 2,
    maximumParticleLife: 4,
    startScale: 0.7,
    endScale: 5,
    image: softDisc,
    imageSize: new Cartesian2(0.5, 0.5),
    sizeInMeters: true,
    startColor: new Color(0.52, 0.48, 0.42, 0.3),
    endColor: new Color(0.34, 0.32, 0.3, 0),
    updateCallback: (particle: Particle, dt: number) => {
      const response = Math.min(1, dt * 1.4)
      particle.velocity.x += (windX - particle.velocity.x) * response
      particle.velocity.y += (windY - particle.velocity.y) * response
      particle.velocity.z -= 3.71 * dt * 0.2
    },
  }))

  const squall = addSystem(new ParticleSystem({
    modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
    show: false,
    emitter: new BoxEmitter(new Cartesian3(90, 90, 5)),
    emissionRate: 0,
    minimumSpeed: 2,
    maximumSpeed: 6,
    minimumParticleLife: 2.4,
    maximumParticleLife: 4.6,
    startScale: 0.8,
    endScale: 1.6,
    image: iceStreak,
    imageSize: new Cartesian2(0.16, 1.15),
    sizeInMeters: true,
    startColor: new Color(0.86, 0.95, 1, 0.8),
    endColor: new Color(0.72, 0.88, 1, 0),
    updateCallback: (particle: Particle, dt: number) => {
      particle.velocity.x = windX * 0.55
      particle.velocity.y = windY * 0.55
      particle.velocity.z = -(8 + 6 * intensity) - 1.4 * dt
    },
  }))

  const fog = addSystem(new ParticleSystem({
    modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
    show: false,
    emitter: new BoxEmitter(new Cartesian3(170, 170, 10)),
    emissionRate: 0,
    minimumSpeed: 0.2,
    maximumSpeed: 1.1,
    minimumParticleLife: 6,
    maximumParticleLife: 11,
    startScale: 0.8,
    endScale: 3.2,
    image: fogBlob,
    imageSize: new Cartesian2(14, 14),
    sizeInMeters: true,
    startColor: new Color(0.82, 0.9, 1, 0.13),
    endColor: new Color(0.82, 0.9, 1, 0),
    updateCallback: (particle: Particle, dt: number) => {
      const response = Math.min(1, dt * 0.35)
      particle.velocity.x += (windX * 0.25 - particle.velocity.x) * response
      particle.velocity.y += (windY * 0.25 - particle.velocity.y) * response
      particle.velocity.z += (0.25 - particle.velocity.z) * response
    },
  }))

  // --- Dust-tornado funnels: glowing helical columns around the vortex. ---
  const vortexEntities: Entity[] = []
  for (let index = 0; index < VORTEX_ENTITY_COUNT; index++) {
    const entity = viewer.entities.add({
      id: `${WEATHER_ENTITY_PREFIX}vortex-${index}`,
      polyline: {
        positions: [],
        width: index === 0 ? 2.6 : 1.8,
        material: new PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: Color.fromCssColorString('#e7c9a0').withAlpha(0.72),
        }),
        show: false,
      },
    })
    vortexEntities.push(entity)
  }

  // --- Electrostatic lightning: jagged ground strikes that flash briefly. ---
  const boltEntities: Entity[] = []
  for (let index = 0; index < BOLT_ENTITY_COUNT; index++) {
    const entity = viewer.entities.add({
      id: `${WEATHER_ENTITY_PREFIX}bolt-${index}`,
      polyline: {
        positions: [],
        width: 3,
        material: new PolylineGlowMaterialProperty({
          glowPower: 0.22,
          color: Color.fromCssColorString('#eaf4ff'),
        }),
        show: false,
      },
    })
    boltEntities.push(entity)
  }
  let activeBolt = -1
  let boltHideAt = 0
  let nextBoltAt = 0

  // --- Screen wash / lightning flash. ---
  const overlayHost = (viewer.canvas.parentElement ?? viewer.container) as HTMLElement
  if (getComputedStyle(overlayHost).position === 'static') {
    overlayHost.style.position = 'relative'
  }
  const overlay = document.createElement('div')
  overlay.id = 'astra-weather-overlay'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.style.cssText =
    'position:absolute;inset:0;pointer-events:none;z-index:1;opacity:0;background-color:#000;'
  overlayHost.appendChild(overlay)

  let anchor: Cartesian3 | null = null
  let destroyed = false
  let updateCount = 0
  const scratch = new Cartesian3()
  const scratchUp = new Cartesian3()

  const windVector = () => {
    windAzimuthRad = kind === 'clear' ? 0.7 : windAzimuthRad
    const speed = kind === 'clear'
      ? 2
      : kind === 'sandstorm' || kind === 'dust-tornado'
        ? 12 + 16 * intensity
        : kind === 'electrostatic'
          ? 9 + 12 * intensity
          : kind === 'ice-squall'
            ? 5 + 8 * intensity
            : 2 + 3 * intensity
    windX = Math.sin(windAzimuthRad) * speed
    windY = Math.cos(windAzimuthRad) * speed
  }

  const cameraHeightAboveGround = () => {
    const cartographic = viewer.camera.positionCartographic
    if (!Number.isFinite(cartographic.height)) return Number.NaN
    const ground = viewer.scene.globe.getHeight(cartographic)
    return cartographic.height - (ground ?? 0)
  }

  const cameraAnchor = (): Cartesian3 | null => {
    const camera = viewer.camera
    const heightAboveGround = cameraHeightAboveGround()
    if (!Number.isFinite(heightAboveGround) || heightAboveGround > SURFACE_CAMERA_MAX_M) {
      return null
    }
    const normal = MARS.geodeticSurfaceNormal(camera.positionWC, scratchUp)
    return Cartesian3.subtract(
      camera.positionWC,
      Cartesian3.multiplyByScalar(normal, Math.max(0, heightAboveGround), scratch),
      new Cartesian3(),
    )
  }

  const localToWorld = (frame: Matrix4, x: number, y: number, z: number) =>
    Matrix4.multiplyByPoint(frame, new Cartesian3(x, y, z), new Cartesian3())

  const boltPath = (frame: Matrix4): Cartesian3[] => {
    let x = (Math.random() * 2 - 1) * 22
    let y = (Math.random() * 2 - 1) * 22
    let z = 26 + Math.random() * 8
    const points: Cartesian3[] = []
    for (let index = 0; index < 9; index++) {
      points.push(localToWorld(frame, x, y, z))
      x += (Math.random() * 2 - 1) * 4.5
      y += (Math.random() * 2 - 1) * 4.5
      z = Math.max(0.4, z - 3.2)
    }
    return points
  }

  const setEntityPath = (entity: Entity, points: Cartesian3[], show: boolean) => {
    if (!entity.polyline) return
    entity.polyline.positions = new ConstantProperty(points)
    entity.polyline.show = new ConstantProperty(show)
  }

  const updateVortex = (frame: Matrix4, now: number) => {
    const active = visible && kind === 'dust-tornado' && intensity > 0.02
    if (!active) {
      for (const entity of vortexEntities) setEntityPath(entity, [], false)
      return
    }
    const spin = now / 900
    for (let helix = 0; helix < vortexEntities.length; helix++) {
      const phase = spin + (helix * Math.PI * 2) / vortexEntities.length
      const points: Cartesian3[] = []
      for (let step = 0; step <= 26; step++) {
        const z = (step / 26) * 23
        const radius = 0.6 + z * 0.16
        const angle = phase + z * 0.42
        points.push(localToWorld(
          frame,
          13 + Math.cos(angle) * radius,
          5 + Math.sin(angle) * radius,
          z,
        ))
      }
      setEntityPath(vortexEntities[helix], points, true)
    }
  }

  const updateLightning = (frame: Matrix4, now: number) => {
    const active = visible && kind === 'electrostatic' && intensity > 0.04
    if (!active) {
      activeBolt = -1
      for (const entity of boltEntities) setEntityPath(entity, [], false)
      return
    }
    if (now >= boltHideAt) {
      activeBolt = -1
      for (const entity of boltEntities) {
        if (entity.polyline) entity.polyline.show = new ConstantProperty(false)
      }
    }
    if (now >= nextBoltAt) {
      activeBolt = Math.floor(Math.random() * boltEntities.length)
      boltHideAt = now + BOLT_ON_MS
      nextBoltAt = boltHideAt + BOLT_MIN_GAP_MS +
        Math.random() * (BOLT_MAX_GAP_MS - BOLT_MIN_GAP_MS)
      const entity = boltEntities[activeBolt]
      if (entity) setEntityPath(entity, boltPath(frame), true)
    }
  }

  const updateOverlay = (now: number) => {
    if (!visible) {
      overlay.style.opacity = '0'
      return
    }
    let opacity = tint.amount * 0.2
    let color = tint.color
    if (kind === 'electrostatic' && activeBolt >= 0 && now < boltHideAt) {
      const flash = clamp((boltHideAt - now) / BOLT_ON_MS, 0, 1) * 0.5 * intensity
      opacity = Math.max(opacity, flash)
      color = [0.88, 0.94, 1]
    }
    overlay.style.backgroundColor =
      `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})`
    overlay.style.opacity = String(clamp(opacity, 0, 0.55))
  }

  return {
    setAnchor(position: Cartesian3 | null) {
      anchor = position ? Cartesian3.clone(position, new Cartesian3()) : null
    },
    clearAnchor() {
      anchor = null
    },
    /** Advance the whole layer. `now` is a monotonic timestamp (ms). */
    update(now: number, nextKind: WeatherKind, nextElapsedS: number) {
      if (destroyed) return
      updateCount += 1
      kind = nextKind
      elapsedS = nextElapsedS
      intensity = weatherIntensity(kind, elapsedS)
      tint = weatherTint(kind, elapsedS)

      // Each event gets a stable wind bearing; varying it slightly per event
      // keeps repeated storms from looking identical.
      windAzimuthRad = 0.45 + (Math.sin(elapsedS * 0.13 + 1.7) + 1) * 0.65
      windVector()

      const cameraHeight = cameraHeightAboveGround()
      const cameraGround = cameraAnchor()
      let activeAnchor = anchor
      if (
        activeAnchor &&
        Number.isFinite(cameraHeight) &&
        cameraHeight <= SURFACE_CAMERA_MAX_M &&
        Cartesian3.distance(viewer.camera.positionWC, activeAnchor) > MAX_ANCHOR_DISTANCE_M
      ) {
        // The user has pulled far away from the asset but is still near the
        // surface: show the local weather around the camera, not a distant
        // meter-scale effect.
        activeAnchor = cameraGround
      }
      if (!activeAnchor) activeAnchor = cameraGround
      const nearSurface = Number.isFinite(cameraHeight) && cameraHeight <= SURFACE_CAMERA_MAX_M
      visible = Boolean(activeAnchor) && nearSurface && intensity > 0.012
      if (!activeAnchor) {
        for (const system of systems) system.show = false
        overlay.style.opacity = '0'
        return
      }

      const frame = Transforms.eastNorthUpToFixedFrame(activeAnchor, MARS)
      const at = (x: number, y: number, z: number) =>
        Matrix4.multiplyByTranslation(frame, new Cartesian3(x, y, z), new Matrix4())

      const stormVisible = visible && (kind === 'sandstorm' || kind === 'dust-tornado')
      const chargeVisible = visible && kind === 'electrostatic'
      const squallVisible = visible && kind === 'ice-squall'
      const fogVisible = visible && kind === 'ice-fog'

      sand.show = stormVisible
      sand.modelMatrix = at(0, 0, 13)
      sand.emissionRate = stormVisible
        ? (kind === 'dust-tornado' ? 70 : 250) * intensity
        : 0

      tornado.show = visible && kind === 'dust-tornado'
      tornado.modelMatrix = at(13, 5, 1.2)
      tornado.emissionRate = tornado.show ? 170 * intensity : 0

      charge.show = chargeVisible
      charge.modelMatrix = at(0, 0, 12)
      charge.emissionRate = chargeVisible ? 110 * intensity : 0

      squall.show = squallVisible
      squall.modelMatrix = at(0, 0, 36)
      squall.emissionRate = squallVisible ? 230 * intensity : 0

      fog.show = fogVisible
      fog.modelMatrix = at(0, 0, 7)
      fog.emissionRate = fogVisible ? 15 * intensity : 0

      updateVortex(frame, now)
      updateLightning(frame, now)
      updateOverlay(now)
    },
    get kind() {
      return kind
    },
    get intensity() {
      return intensity
    },
    get visible() {
      return visible
    },
    get windAzimuthRad() {
      return windAzimuthRad
    },
    get tint() {
      return tint
    },
    get anchor() {
      return anchor
    },
    get cameraHeightAboveGround() {
      return cameraHeightAboveGround()
    },
    get updateCount() {
      return updateCount
    },
    /** Body roll (radians) for an asset facing `bearingRad`. */
    rollForHeading(bearingRad: number) {
      return weatherLeanRad(kind, elapsedS) * Math.sin(windAzimuthRad - bearingRad)
    },
    get activeSystems() {
      return systems.filter((system) => system.show).length
    },
    get entityCount() {
      return viewer.entities.values.filter((entity) =>
        entity.id.startsWith(WEATHER_ENTITY_PREFIX)).length
    },
    get boltCount() {
      return boltEntities.filter((entity) => entity.polyline?.show?.getValue(viewer.clock.currentTime)).length
    },
    destroy() {
      destroyed = true
      for (const system of systems) viewer.scene.primitives.remove(system)
      for (const entity of [...vortexEntities, ...boltEntities]) viewer.entities.remove(entity)
      overlay.remove()
    },
  }
}

export type WeatherFx = ReturnType<typeof createWeatherFx>
