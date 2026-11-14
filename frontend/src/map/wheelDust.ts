import { Cartesian2, Cartesian3, Color, ConeEmitter, Matrix4, ParticleSystem, Transforms, Viewer } from 'cesium'
import { MARS } from './trek'

/** Ballistic dust grains under Mars gravity. Emission follows actual motion,
 * then existing particles settle/fade when the rover brakes to a standstill. */
export function createWheelDust(viewer: Viewer) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16)
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient; context.fillRect(0, 0, 32, 32)
  const systems = [-1.18, 1.18].map(side => {
    const system = new ParticleSystem({
      image: canvas, imageSize: new Cartesian2(0.18, 0.18), sizeInMeters: true,
      emitter: new ConeEmitter(0.75), emissionRate: 0,
      minimumSpeed: 0.2, maximumSpeed: 0.7,
      minimumParticleLife: 0.25, maximumParticleLife: 0.7,
      startScale: 0.3, endScale: 1.6,
      startColor: new Color(0.7, 0.5, 0.32, 0.22), endColor: new Color(0.55, 0.38, 0.24, 0),
      updateCallback: (particle, dt) => {
        const up = MARS.geodeticSurfaceNormal(particle.position, new Cartesian3())
        Cartesian3.add(particle.velocity, Cartesian3.multiplyByScalar(up, -3.71 * dt, up), particle.velocity)
      },
    })
    viewer.scene.primitives.add(system)
    return { side, system }
  })
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
      for (const { side, system } of systems) {
        system.modelMatrix = Matrix4.multiplyByTranslation(matrix, new Cartesian3(-1.3, side, 0.35), new Matrix4())
        system.emissionRate = Math.min(24, Math.max(0, speed) * 28)
      }
    },
    stop() { for (const { system } of systems) system.emissionRate = 0 },
    destroy() {
      for (const { system } of systems) viewer.scene.primitives.remove(system)
      for (const plume of plumes) viewer.scene.primitives.remove(plume)
    },
  }
}
