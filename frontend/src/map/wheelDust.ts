import { Cartesian2, Cartesian3, Color, ConeEmitter, HeadingPitchRoll, Matrix3, Matrix4, ParticleSystem, Quaternion, Transforms, Viewer } from 'cesium'
import { MARS } from './trek'

/** Ballistic dust grains kicked back near tyres (Mars gravity). Emission follows
 * actual motion, then existing particles settle/fade when the vehicle stops. */
export function createWheelDust(viewer: Viewer) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16)
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient; context.fillRect(0, 0, 32, 32)

  // Approximate tyre positions in vehicle model space (x forward, y left, z up)
  // with a slight rear bias so dust kicks back from the wheels.
  const wheelOffsets = [
    { x: 1.05, y: -1.05, z: 0.08 },
    { x: 1.05, y: 1.05, z: 0.08 },
    { x: -1.15, y: -1.05, z: 0.08 },
    { x: -1.15, y: 1.05, z: 0.08 },
  ]

  // Rotate emitter frame so ConeEmitter (+Z) points mostly backward and upward.
  const kickbackRotation = Matrix3.fromQuaternion(
    Quaternion.fromHeadingPitchRoll(new HeadingPitchRoll(Math.PI, -0.55, 0), new Quaternion()),
    new Matrix3(),
  )

  const systems = wheelOffsets.map(offset => {
    const system = new ParticleSystem({
      image: canvas, imageSize: new Cartesian2(0.14, 0.14), sizeInMeters: true,
      emitter: new ConeEmitter(0.55), emissionRate: 0,
      minimumSpeed: 0.35, maximumSpeed: 1.35,
      minimumParticleLife: 0.22, maximumParticleLife: 0.65,
      startScale: 0.22, endScale: 1.15,
      startColor: new Color(0.72, 0.52, 0.35, 0.16), endColor: new Color(0.55, 0.38, 0.24, 0),
      updateCallback: (particle, dt) => {
        const up = MARS.geodeticSurfaceNormal(particle.position, new Cartesian3())
        Cartesian3.add(particle.velocity, Cartesian3.multiplyByScalar(up, -3.71 * dt, up), particle.velocity)
      },
    })
    viewer.scene.primitives.add(system)
    return { offset, system }
  })
  const scratch = new Matrix4()
  const rotationMatrix = Matrix4.fromRotationTranslation(kickbackRotation, Cartesian3.ZERO, new Matrix4())
  const plumes: ParticleSystem[] = []
  return {
    jet(position: Cartesian3) {
      const plume = new ParticleSystem({
        modelMatrix: Transforms.eastNorthUpToFixedFrame(position, MARS),
        image: canvas, emitter: new ConeEmitter(0.22), emissionRate: 180, lifetime: 0.8, loop: false,
        minimumSpeed: 4, maximumSpeed: 9, minimumParticleLife: 1, maximumParticleLife: 2,
        imageSize: new Cartesian2(0.4, 0.4), sizeInMeters: true, startScale: 0.5, endScale: 5,
        startColor: new Color(0.75, 0.61, 0.46, 0.6), endColor: new Color(0.6, 0.45, 0.3, 0),
        updateCallback: (particle, dt) => {
          const up = MARS.geodeticSurfaceNormal(particle.position, new Cartesian3())
          Cartesian3.add(particle.velocity, Cartesian3.multiplyByScalar(up, -3.71 * dt, up), particle.velocity)
        },
      })
      viewer.scene.primitives.add(plume); plumes.push(plume)
    },
    update(matrix: Matrix4, speed: number) {
      const rate = Math.min(10, Math.max(0, speed) * 9)
      for (const { offset, system } of systems) {
        system.modelMatrix = Matrix4.multiply(
          Matrix4.multiplyByTranslation(matrix, new Cartesian3(offset.x, offset.y, offset.z), scratch),
          rotationMatrix,
          system.modelMatrix ?? new Matrix4(),
        )
        system.emissionRate = rate
      }
    },
    stop() { for (const { system } of systems) system.emissionRate = 0 },
    destroy() {
      for (const { system } of systems) viewer.scene.primitives.remove(system)
      for (const plume of plumes) viewer.scene.primitives.remove(plume)
    },
  }
}
