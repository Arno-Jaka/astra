import {
  BoxEmitter,
  Cartesian2,
  Cartesian3,
  Color,
  Matrix4,
  ParticleSystem,
  Transforms,
  Viewer,
} from 'cesium'

const PARTICLE_COUNT = 25000
const BOUNDS = { x: 100, y: 30, z: 100 }
const WIND = { x: -0.5, y: -0.05, z: 0.2 }

function makeSoftDisc(): HTMLCanvasElement {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const center = size / 2
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.8)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return canvas
}

type Velocity = { x: number; y: number; z: number; amplitude: number; speed: number }

export function createSandstormFx(viewer: Viewer) {
  const velocities: Velocity[] = []
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    velocities.push({
      x: WIND.x + (Math.random() - 0.5) * 0.1,
      y: WIND.y + (Math.random() - 0.5) * 0.05,
      z: WIND.z + (Math.random() - 0.5) * 0.1,
      amplitude: Math.random() * 0.05,
      speed: 1 + Math.random() * 2,
    })
  }

  const system = new ParticleSystem({
    modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
    emitter: new BoxEmitter(new Cartesian3(BOUNDS.x / 2, BOUNDS.z / 2, BOUNDS.y / 2)),
    emissionRate: PARTICLE_COUNT / 4,
    minimumSpeed: 0,
    maximumSpeed: 0.001,
    minimumParticleLife: 100000,
    maximumParticleLife: 100000,
    startScale: 1,
    endScale: 1,
    image: makeSoftDisc(),
    imageSize: new Cartesian2(14, 14),
    sizeInMeters: true,
    startColor: Color.fromCssColorString('#cca473').withAlpha(0.7),
    endColor: Color.fromCssColorString('#cca473').withAlpha(0.7),
    updateCallback: (particle, _dt) => {
      const index = (particle as unknown as { _astraIndex?: number })._astraIndex ?? 0
      const v = velocities[index % velocities.length]
      particle.velocity.x = v.x
      particle.velocity.y = v.z
      particle.velocity.z = v.y + Math.sin(performance.now() / 1000 * v.speed) * v.amplitude
    },
  })

  // Assign stable indices so each particle keeps its turbulence profile.
  let nextIndex = 0
  const originalBurst = (system as unknown as { _emit?: unknown })
  void originalBurst
  // Cesium assigns particles internally; tag on first update by position cycling fallback.
  // Simpler: use emitterInitializers isn't available; instead track via a counter on update.
  const tag = new WeakMap<object, number>()
  const baseUpdate = system.updateCallback
  system.updateCallback = (particle, dt) => {
    let idx = tag.get(particle as object)
    if (idx === undefined) {
      idx = nextIndex++ % velocities.length
      tag.set(particle as object, idx)
    }
    ;(particle as unknown as { _astraIndex: number })._astraIndex = idx
    baseUpdate(particle, dt)

    // Boundary recycling in local emitter space.
    if (particle.position.x < -BOUNDS.x / 2) particle.position.x = BOUNDS.x / 2
    if (particle.position.y < -BOUNDS.z / 2) particle.position.y = BOUNDS.z / 2
    if (particle.position.y > BOUNDS.z / 2) particle.position.y = -BOUNDS.z / 2
    if (particle.position.z < 0) particle.position.z = BOUNDS.y
    if (particle.position.z > BOUNDS.y) particle.position.z = 0
  }

  viewer.scene.primitives.add(system)

  let anchor = Cartesian3.clone(viewer.camera.positionWC)

  const preRender = viewer.scene.preRender.addEventListener(() => {
    const position = viewer.camera.positionWC
    if (Cartesian3.distance(position, anchor) > 40) {
      anchor = Cartesian3.clone(position)
    }
    Transforms.eastNorthUpToFixedFrame(anchor, undefined, system.modelMatrix)
    // Lift emitter volume slightly above ground/camera reference for visibility.
    Matrix4.multiplyByTranslation(system.modelMatrix, new Cartesian3(0, 0, -5), system.modelMatrix)
  })

  return {
    destroy() {
      preRender()
      if (!viewer.isDestroyed()) viewer.scene.primitives.remove(system)
    },
  }
}

export type SandstormFx = ReturnType<typeof createSandstormFx>
