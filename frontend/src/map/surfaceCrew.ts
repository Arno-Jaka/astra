import { Cartesian3, HeadingPitchRoll, Matrix4, Model, ModelAnimationLoop, Transforms, type Viewer } from 'cesium'
import { MARS } from './trek'
import { JUMP_DURATION, jumpHeight, MARS_GAIT_RATE } from './crewMission'
import { sampleRoute, totalDistanceKm, type RouteSample, type TraversableRoute } from './routePath'

export const CREW_ASSETS = [
  { name: 'Finn', url: new URL('../3D _assets/Astronaut_FinnTheFrog.gltf', import.meta.url).href },
  { name: 'Rae', url: new URL('../3D _assets/Astronaut_RaeTheRedPanda.gltf', import.meta.url).href },
  { name: 'Fernando', url: new URL('../3D _assets/Astronaut_FernandoTheFlamingo.gltf', import.meta.url).href },
]
type Pose = 'Idle' | 'Walk' | 'Jump' | 'Jump_Idle' | 'Jump_Land'
type Member = { model: Model; clip: Pose | null; clock: number }

/** All three actors share mission timing, but have staggered exits and gait phases.
 * World-space jump height is ballistic; authored jump root translation is locked
 * so the exported Earth-style trajectory cannot add a second vertical impulse. */
export async function createSurfaceCrew(viewer: Viewer, route: TraversableRoute, stagingT: number,
  groundAt: (sample: RouteSample) => number, cancelled: () => boolean) {
  const members: Member[] = []
  let disposed = false
  const destroy = () => {
    disposed = true
    for (const { model } of members) if (!model.isDestroyed()) viewer.scene.primitives.remove(model)
  }
  try {
    // Sequential ownership makes cancellation/error cleanup deterministic.
    for (const asset of CREW_ASSETS) {
      const model = await Model.fromGltfAsync({ url: asset.url, scale: 0.65, show: false })
      if (cancelled()) { model.destroy(); destroy(); return null }
      viewer.scene.primitives.add(model)
      members.push({ model, clip: null, clock: 0 })
    }
  } catch (error) { destroy(); throw error }
  let elapsed = 0
  let stopped = false
  let approach = 0
  let hop = -1
  let mode: 'exit' | 'hold' | 'walk' | 'complete' = 'exit'
  const total = totalDistanceKm(route)
  const stage = sampleRoute(route, stagingT)
  const pose = (member: Member, clip: Pose, dt: number, rate = 1) => {
    if (!member.model.ready) return
    if (member.clip !== clip) {
      member.model.activeAnimations.removeAll()
      member.clock = 0
      member.clip = clip
      member.model.activeAnimations.add({ name: clip, loop: ModelAnimationLoop.REPEAT,
        animationTime: duration => (member.clock % duration) / duration })
      // Root translation is controlled by terrain contact / Mars ballistic motion.
      const root = member.model.getNode('Root')
      if (root) root.matrix = Matrix4.clone(root.originalMatrix)
    }
    member.clock += dt * rate
  }
  const place = (member: Member, sample: RouteSample, along: number, side: number, height: number) => {
    const lon = sample.lon + (Math.sin(sample.bearing) * along + Math.cos(sample.bearing) * side) / (59238 * Math.max(0.1, Math.cos(sample.lat * Math.PI / 180)))
    const lat = sample.lat + (Math.cos(sample.bearing) * along - Math.sin(sample.bearing) * side) / 59238
    const ground = groundAt({ ...sample, lon, lat })
    // These rigs face their glTF +Z axis, which Cesium maps onto the local -Y
    // axis of the model frame. `bearing + PI` is the heading that points that
    // forward axis along the route bearing (verified against Cesium at several
    // bearings: with `bearing - PI/2` the crew walked 90° to the right).
    member.model.modelMatrix = Transforms.headingPitchRollToFixedFrame(
      Cartesian3.fromDegrees(lon, lat, ground + 0.04 + height, MARS), new HeadingPitchRoll(sample.bearing + Math.PI, 0, 0), MARS)
  }
  return {
    members,
    destroy,
    get mode() { return mode },
    get fraction() { return stagingT + approach / (total * 1000) },
    stop() { stopped = true; hop = -1 },
    walk() { mode = 'walk' },
    jump() { if ((mode === 'walk' || mode === 'hold' || mode === 'complete') && hop < 0) hop = 0 },
    update(dt: number, pace: number) {
      if (disposed || members.some(m => !m.model.ready)) return
      if (!stopped) elapsed += dt
      if (hop >= 0) { hop += dt; if (hop >= JUMP_DURATION + 0.5) hop = -1 }
      if (!stopped && mode === 'walk' && hop < 0) {
        approach = Math.min((1 - stagingT) * total * 1000, approach + dt * pace)
        if (approach >= (1 - stagingT) * total * 1000) mode = 'complete'
      }
      members.forEach((member, index) => {
        const exitTime = elapsed - index * 1.2
        member.model.show = exitTime >= 0
        // Hide the unrelated weapon accessory supplied with these character rigs.
        const pistol = member.model.getNode('Pistol')
        if (pistol) pistol.show = false
        if (mode === 'exit') {
          const t = Math.max(0, Math.min(1, exitTime / 3))
          pose(member, t < 1 && !stopped ? 'Walk' : 'Idle', dt, t < 1 ? MARS_GAIT_RATE : 1)
          place(member, stage, -1 + index * 1.5, 2.4 + t * (2.5 + index), 0)
        } else {
          const airborne = hop >= 0 && hop < JUMP_DURATION
          const landing = hop >= JUMP_DURATION
          const clip: Pose = airborne ? (hop < 0.22 ? 'Jump' : 'Jump_Idle') : landing ? 'Jump_Land' : mode === 'walk' && !stopped ? 'Walk' : 'Idle'
          pose(member, clip, dt, clip === 'Walk' ? Math.min(1.2, pace / 0.5) * MARS_GAIT_RATE : clip === 'Jump_Land' ? 0.3666667 / 0.5 : 1)
          const sample = mode === 'hold' ? stage : sampleRoute(route, stagingT + approach / (total * 1000))
          // Blend the exit formation into the approach without teleportation.
          const blend = Math.min(1, approach / 8)
          place(member, sample, (-1 + index * 1.5) * (1 - blend) - index * 1.5 * blend,
            (4.9 + index) * (1 - blend) + (index - 1) * 1.5 * blend, airborne ? jumpHeight(hop) : 0)
        }
      })
      if (mode === 'exit' && elapsed >= 5.4) mode = 'hold'
    },
  }
}
export type SurfaceCrew = NonNullable<Awaited<ReturnType<typeof createSurfaceCrew>>>
