import { Cartesian3, Color, ColorBlendMode, HeadingPitchRoll, Matrix4, Model, ModelAnimationLoop, Transforms, type Viewer } from 'cesium'
import { MARS } from './trek'
import { approachSpeedMps, CREW_FORWARD_HEADING_OFFSET, HOP_GROUND_FACTOR, HOP_SPEED_FACTOR, JUMP_DURATION, jumpHeight, MARS_GAIT_RATE } from './crewMission'
import { sampleRoute, totalDistanceKm, type RouteSample, type TraversableRoute } from './routePath'
import type { WeatherTint } from '../store/weatherEngine'

export const CREW_ASSETS = [
  { name: 'Finn', url: new URL('../3D _assets/Astronaut_FinnTheFrog.gltf', import.meta.url).href },
  { name: 'Rae', url: new URL('../3D _assets/Astronaut_RaeTheRedPanda.gltf', import.meta.url).href },
  { name: 'Fernando', url: new URL('../3D _assets/Astronaut_FernandoTheFlamingo.gltf', import.meta.url).href },
]
type Pose = 'Idle' | 'Walk' | 'Jump' | 'Jump_Idle' | 'Jump_Land'
type Member = {
  model: Model
  clip: Pose | null
  clock: number
  /** Per-astronaut gait, fixed (deterministic) so the crew is never in lockstep. */
  paceFactor: number
  side: number // lateral formation offset (m); uneven on purpose
  exitSide: number // clearance from the parked carrier at disembark (m)
  exitAlong: number // fore/aft offset at disembark (m)
  exitDelay: number // staggered disembark (s)
  hop: number // -1 grounded, else seconds since takeoff
  hopCooldown: number // seconds until the next scheduled hop
  hopPeriod: number // seconds between scheduled hops
  progress: number // metres walked from the staging point
  exited: boolean
}

/** Three gaits: slightly different stride factors, uneven spacing, staggered
 * exits and staggered hop phases so they never move in unison. The crew steps
 * out of the carrier's flank (`exitSide`, all on one side, clear of the ~2 m
 * SEV half-width) and merges to its formation offset (`side`) over the first
 * metres of the walk. Hops are frequent and short-cycled so the crew bounds
 * continuously in the low gravity rather than plodding. */
const CREW_GAIT = [
  { paceFactor: 1.04, side: -1.1, exitSide: 5.2, exitAlong: -1.0, exitDelay: 0.15, hopCooldown: 0.15, hopPeriod: 0.35 },
  { paceFactor: 0.97, side: 0.9, exitSide: 5.6, exitAlong: -0.2, exitDelay: 0.55, hopCooldown: 0.55, hopPeriod: 0.50 },
  { paceFactor: 1.0, side: 0.1, exitSide: 5.3, exitAlong: 0.7, exitDelay: 0.95, hopCooldown: 0.95, hopPeriod: 0.65 },
]
/** Distance (m) over which the crew merges from its beside-the-carrier exit
 * clearance to its walking formation offset. Keeps them clear of the parked
 * vehicle without spreading the group out. */
const EXIT_MERGE_M = 18
/** Bounded trailing gap (m): the group stays together without equal spacing.
 *  Large enough to absorb the airborne surge of a bound so a hop never yanks a
 *  trailing astronaut forward. */
const MAX_TRAIL_M = 6.0
/** How long the landing pose holds before the walk resumes (s). */
const LANDING_HOLD_S = 0.5
/** Authored clip lengths (s); each is played once, in step with its phase. */
const JUMP_CLIP_S = 0.3666667
const JUMP_IDLE_CLIP_S = 0.5
const LANDING_CLIP_S = 0.3666667
/** Fraction of the air time spent in the takeoff/`Jump` clip; the rest floats
 * in `Jump_Idle`. Biased to `Jump` so the leap reads as a jump, not a glide. */
const JUMP_TAKEOFF_FRACTION = 0.6

/** All three actors share the mission goal but have independent gait, spacing,
 * hop timing and exit timing. World-space jump height is ballistic under Mars
 * gravity; the authored jump root translation is locked so the exported
 * Earth-style trajectory cannot add a second vertical impulse. */
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
      members.push({ model, clip: null, clock: 0, ...CREW_GAIT[members.length], hop: -1, progress: 0, exited: false })
    }
  } catch (error) { destroy(); throw error }
  let elapsed = 0
  let stopped = false
  let leadProgress = 0
  let mode: 'exit' | 'hold' | 'walk' | 'complete' = 'exit'
  // Simulated-weather response: body roll in the wind and a dust/ice wash.
  let weatherRoll = 0
  let weatherTintAmount = 0
  const weatherColor = new Color(1, 1, 1, 1)
  const total = totalDistanceKm(route)
  const spanM = Math.max(1e-6, (1 - stagingT) * total * 1000)
  // Presentation speed: the on-screen final approach covers the span in
  // CREW_APPROACH_SECONDS so the crew bounds to the target promptly. The panel's
  // EVA estimate still uses the real suited pace.
  const approachSpeed = approachSpeedMps(spanM)
  // Play each authored clip once across its phase, so the takeoff, float and
  // landing all read clearly instead of being cut short or frozen mid-pose.
  const clipRate = (clip: Pose) => {
    if (clip === 'Jump') return JUMP_CLIP_S / (JUMP_DURATION * JUMP_TAKEOFF_FRACTION)
    if (clip === 'Jump_Idle') return JUMP_IDLE_CLIP_S / (JUMP_DURATION * (1 - JUMP_TAKEOFF_FRACTION))
    if (clip === 'Jump_Land') return LANDING_CLIP_S / LANDING_HOLD_S
    if (clip === 'Walk') return Math.min(2.2, approachSpeed / 3) * MARS_GAIT_RATE
    return MARS_GAIT_RATE
  }
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
    // These rigs face their glTF +Z axis, which Cesium's axis correction maps
    // onto the model frame's +X axis (east at heading 0). The compass bearing
    // b points along the route, and local +X points at azimuth 90° + heading,
    // so CREW_FORWARD_HEADING_OFFSET aims the body's forward axis along the
    // direction of travel (verified against joint world positions).
    member.model.modelMatrix = Transforms.headingPitchRollToFixedFrame(
      Cartesian3.fromDegrees(lon, lat, ground + 0.04 + height + Math.abs(weatherRoll) * 0.45, MARS), new HeadingPitchRoll(sample.bearing + CREW_FORWARD_HEADING_OFFSET, 0, weatherRoll), MARS)
  }
  return {
    members,
    destroy,
    get mode() { return mode },
    get fraction() { return stagingT + leadProgress / (total * 1000) },
    /** Visual speed of the on-screen final approach (m/s). */
    get speedMps() { return approachSpeed },
    stop() { stopped = true; for (const member of members) member.hop = -1 },
    /** Wind lean (body roll, radians) and dust/ice colour wash from the
     *  simulated weather layer. Applied to every crew member's pose. */
    setWeather(rollRad: number, tint: WeatherTint) {
      weatherRoll = rollRad
      weatherTintAmount = tint.amount
      weatherColor.red = tint.color[0]
      weatherColor.green = tint.color[1]
      weatherColor.blue = tint.color[2]
    },
    walk() { mode = 'walk' },
    jump() {
      if (mode !== 'walk' && mode !== 'hold' && mode !== 'complete') return
      for (const member of members) if (member.hop < 0) { member.hop = 0; member.hopCooldown = member.hopPeriod }
    },
    update(dt: number, pace: number) {
      if (disposed || members.some(m => !m.model.ready)) return
      for (const member of members) {
        member.model.colorBlendMode = ColorBlendMode.MIX
        member.model.color = weatherColor
        member.model.colorBlendAmount = weatherTintAmount
      }
      if (!stopped) elapsed += dt
      if (!stopped && mode === 'walk') {
        for (const member of members) {
          const airborne = member.hop >= 0 && member.hop < JUMP_DURATION
          // A bound is a long gravity stride; between bounds the crew glides.
          const speed = Math.max(pace, approachSpeed) * member.paceFactor * (airborne ? HOP_SPEED_FACTOR : HOP_GROUND_FACTOR)
          member.progress = Math.min(spanM, member.progress + dt * speed)
        }
        // Pull stragglers up to the bounded trailing gap; the fastest leads.
        const lead = Math.max(...members.map(member => member.progress))
        for (const member of members) member.progress = Math.max(member.progress, lead - MAX_TRAIL_M)
        leadProgress = Math.max(...members.map(member => member.progress))
        if (leadProgress >= spanM - 1e-6) mode = 'complete'
      }
      // Independent, staggered hop schedule (a deliberate jump() overrides it).
      for (const member of members) {
        if (member.hop >= 0) {
          member.hop += dt
          if (member.hop >= JUMP_DURATION + LANDING_HOLD_S) member.hop = -1
        } else if (mode === 'walk' && !stopped) {
          member.hopCooldown -= dt
          if (member.hopCooldown <= 0) { member.hop = 0; member.hopCooldown = member.hopPeriod }
        }
      }
      const base = sampleRoute(route, Math.min(1, stagingT + (mode === 'exit' || mode === 'hold' ? 0 : leadProgress) / (total * 1000)))
      members.forEach((member) => {
        member.model.show = elapsed >= member.exitDelay
        // Hide the unrelated weapon accessory supplied with these character rigs.
        const pistol = member.model.getNode('Pistol')
        if (pistol) pistol.show = false
        if (mode === 'exit') {
          const t = elapsed - member.exitDelay
          if (t < 0) return
          // Hop out of the carrier's flank: takeoff, float, then land beside it.
          const airborne = t < JUMP_DURATION
          const clip: Pose = airborne ? (t < JUMP_DURATION * JUMP_TAKEOFF_FRACTION ? 'Jump' : 'Jump_Idle')
            : t < JUMP_DURATION + LANDING_HOLD_S ? 'Jump_Land' : 'Idle'
          pose(member, clip, dt, clipRate(clip))
          // The lateral offset grows through the hop so the crew visibly steps
          // out to the side of the parked vehicle instead of through its body.
          const out = 0.86 + 0.14 * Math.min(1, t / JUMP_DURATION)
          place(member, stage, member.exitAlong, member.side + member.exitSide * out,
            airborne ? jumpHeight(t) : 0)
          if (t >= JUMP_DURATION + LANDING_HOLD_S) member.exited = true
          return
        }
        const airborne = member.hop >= 0 && member.hop < JUMP_DURATION
        const landing = member.hop >= JUMP_DURATION
        const clip: Pose = airborne ? (member.hop < JUMP_DURATION * JUMP_TAKEOFF_FRACTION ? 'Jump' : 'Jump_Idle')
          : landing ? 'Jump_Land' : mode === 'walk' && !stopped ? 'Walk' : 'Idle'
        pose(member, clip, dt, clipRate(clip))
        // Merge from the exit clearance to the formation offset as they walk,
        // so they clear the parked carrier before tightening up.
        const merge = Math.max(0, 1 - member.progress / EXIT_MERGE_M)
        place(member, base, member.progress - leadProgress + member.exitAlong * merge,
          member.side + member.exitSide * merge, airborne ? jumpHeight(member.hop) : 0)
      })
      if (mode === 'exit' && members.every(member => member.exited)) mode = 'hold'
    },
  }
}
export type SurfaceCrew = NonNullable<Awaited<ReturnType<typeof createSurfaceCrew>>>
