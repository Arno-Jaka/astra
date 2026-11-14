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

const PARTICLE_COUNT = 12000
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
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.8)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
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

  const life = 8
  const system = new ParticleSystem({
    modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
    emitter: new BoxEmitter(new Cartesian3(BOUNDS.x / 2, BOUNDS.z / 2, BOUNDS.y / 2)),
    emissionRate: PARTICLE_COUNT / life,
    minimumSpeed: 0,
    maximumSpeed: 0.01,
    minimumParticleLife: life,
    maximumParticleLife: life,
    startScale: 1,
    endScale: 1,
    image: makeSoftDisc(),
    imageSize: new Cartesian2(12, 12),
    sizeInMeters: true,
    startColor: Color.fromCssColorString('#cca473').withAlpha(0.7),
    endColor: Color.fromCssColorString('#cca473').withAlpha(0.7),
  })

  const tag = new WeakMap<object, number>()
  let nextIndex = 0
  system.updateCallback = (particle, dt) => {
    let idx = tag.get(particle as object)
    if (idx === undefined) {
      idx = nextIndex++ % velocities.length
      tag.set(particle as object, idx)
    }
    const v = velocities[idx]
    const time = performance.now() / 1000

    // Directional drift + swirling sine-wave turbulence.
    particle.velocity.x = v.x
    particle.velocity.y = v.z
    particle.velocity.z = v.y + Math.sin(time * v.speed) * v.amplitude

    // Advance position explicitly for predictable storm motion.
    particle.position.x += particle.velocity.x * dt * 20
    particle.position.y += particle.velocity.y * dt * 20
    particle.position.z += particle.velocity.z * dt * 20

    // Seamless boundary recycling within the storm bounds.
    if (particle.position.x < -BOUNDS.x / 2) particle.position.x = BOUNDS.x / 2
    if (particle.position.x > BOUNDS.x / 2) particle.position.x = -BOUNDS.x / 2
    if (particle.position.y < -BOUNDS.z / 2) particle.position.y = BOUNDS.z / 2
    if (particle.position.y > BOUNDS.z / 2) particle.position.y = -BOUNDS.z / 2
    if (particle.position.z < 0) particle.position.z = BOUNDS.y
    if (particle.position.z > BOUNDS.y) particle.position.z = 0
  }

  viewer.scene.primitives.add(system)

  let anchor = Cartesian3.clone(viewer.camera.positionWC)

  const preRender = viewer.scene.preRender.addEventListener(() => {
    const position = viewer.camera.positionWC
    if (!Number.isFinite(position.x)) return
    if (Cartesian3.distance(position, anchor) > 30) {
      anchor = Cartesian3.clone(position)
    }
    Transforms.eastNorthUpToFixedFrame(anchor, undefined, system.modelMatrix)
    Matrix4.multiplyByTranslation(system.modelMatrix, new Cartesian3(0, 0, 0), system.modelMatrix)
  })

  return {
    destroy() {
      preRender()
      if (!viewer.isDestroyed()) viewer.scene.primitives.remove(system)
    },
  }
}

export type SandstormFx = ReturnType<typeof createSandstormFx>
