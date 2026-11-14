import {
  Cartesian3,
  Color,
  ColorBlendMode,
  HeadingPitchRoll,
  Matrix4,
  Model,
  ModelAnimationLoop,
  Transforms,
  type Viewer,
} from 'cesium'
import { MARS } from './trek'
import { bearingRad, type RouteSample } from './routePath'
import { CREW_FORWARD_HEADING_OFFSET, JUMP_DURATION } from './crewMission'
import { CREW_ASSETS } from './surfaceCrew'
import { distanceMeters, offsetLonLat, type LonLat, type ScienceSite } from './scienceSites'
import type { WeatherTint } from '../store/weatherEngine'

type Pose = 'Idle' | 'Walk' | 'Jump' | 'Jump_Idle' | 'Jump_Land' | 'Duck'
type Mode = 'off' | 'exit' | 'travel' | 'work' | 'done' | 'board'

type Member = {
  model: Model
  clip: Pose | null
  clock: number
  /** Staggered disembark delay (s). */
  exitDelay: number
  /** Heading (radians) used while stepping out of the vehicle. */
  exitHeading: number
  /** Foot of the parked vehicle where the astronaut stepped out. */
  vehicleExit: LonLat
  /** Start of the current walk segment. */
  travelFrom: LonLat
  current: LonLat
  target: LonLat
  inward: number
  travelM: number
  progress: number
}

/** Radius (m) at which the three astronauts surround a science target. */
export const SCIENCE_SURROUND_RADIUS_M = 1.8

/** On-screen walking speed for a short field walk. Distances are compressed so
 *  a nearby point never takes a real EVA-length trudge across the map. */
const travelSpeed = (metres: number) => Math.max(2.2, Math.min(12, metres / 9))

/** Authored clip lengths used to play each jump phase once. */
const JUMP_CLIP_S = 0.3666667
const JUMP_IDLE_CLIP_S = 0.5
const LANDING_CLIP_S = 0.3666667
const CONTACT_S = 0.18
const JUMP_TAKEOFF_FRACTION = 0.6

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Three astronauts for a field-science stop. They step out of the parked SEV,
 * walk to evenly spaced points around a science target, face inward, loop the
 * supplied `Duck` crouch as the best available "working" pose, then return to
 * the vehicle on request. No external assets are used: only the existing
 * astronaut rigs and their authored clips.
 */
export async function createScienceCrew(
  viewer: Viewer,
  groundAt: (sample: RouteSample) => number,
  cancelled: () => boolean,
) {
  const members: Member[] = []
  let disposed = false
  let mode: Mode = 'off'
  let elapsed = 0
  let weatherRoll = 0
  let weatherTintAmount = 0
  const weatherColor = new Color(1, 1, 1, 1)
  let baseSample: RouteSample = {
    lon: 0,
    lat: 0,
    elevationM: 0,
    distanceKm: 0,
    gradeDeg: 0,
    bearing: 0,
  }
  let pendingSite: ScienceSite | null = null
  let workElapsed = 0
  let workDuration = 1

  const destroy = () => {
    disposed = true
    for (const { model } of members) if (!model.isDestroyed()) viewer.scene.primitives.remove(model)
    members.length = 0
  }

  try {
    for (const asset of CREW_ASSETS) {
      const model = await Model.fromGltfAsync({ url: asset.url, scale: 0.65, show: false })
      if (cancelled()) {
        model.destroy()
        destroy()
        return null
      }
      viewer.scene.primitives.add(model)
      members.push({
        model,
        clip: null,
        clock: 0,
        exitDelay: 0,
        exitHeading: 0,
        vehicleExit: { lon: 0, lat: 0 },
        travelFrom: { lon: 0, lat: 0 },
        current: { lon: 0, lat: 0 },
        target: { lon: 0, lat: 0 },
        inward: 0,
        travelM: 0,
        progress: 0,
      })
    }
  } catch (error) {
    destroy()
    throw error
  }

  const pose = (member: Member, clip: Pose, dt: number, rate = 1) => {
    if (!member.model.ready) return
    if (member.clip !== clip) {
      member.model.activeAnimations.removeAll()
      member.clock = 0
      member.clip = clip
      member.model.activeAnimations.add({
        name: clip,
        loop: ModelAnimationLoop.REPEAT,
        animationTime: duration => (member.clock % duration) / duration,
      })
      // The authored root translation is replaced by ground contact; the
      // crouch/reach pose itself is kept.
      const root = member.model.getNode('Root')
      if (root) root.matrix = Matrix4.clone(root.originalMatrix)
    }
    member.clock += dt * rate
  }

  const place = (member: Member, point: LonLat, heading: number, height = 0) => {
    const ground = groundAt({ ...baseSample, lon: point.lon, lat: point.lat })
    member.model.modelMatrix = Transforms.headingPitchRollToFixedFrame(
      Cartesian3.fromDegrees(point.lon, point.lat, ground + 0.04 + height, MARS),
      new HeadingPitchRoll(
        heading + CREW_FORWARD_HEADING_OFFSET,
        0,
        weatherRoll,
      ),
      MARS,
    )
  }

  const targetFor = (member: Member, site: ScienceSite, index: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / members.length
    const east = Math.cos(angle) * SCIENCE_SURROUND_RADIUS_M
    const north = Math.sin(angle) * SCIENCE_SURROUND_RADIUS_M
    member.target = offsetLonLat(site.lon, site.lat, 0, north, east)
    member.inward = bearingRad(member.target.lon, member.target.lat, site.lon, site.lat)
    member.travelFrom = member.current
    member.progress = 0
    member.travelM = Math.max(0.01, distanceMeters(member.current, member.target))
  }

  const beginTravel = (site: ScienceSite, durationS: number) => {
    members.forEach((member, index) => targetFor(member, site, index))
    mode = 'travel'
    workElapsed = 0
    workDuration = Math.max(0.5, durationS)
    pendingSite = site
  }

  return {
    members,
    destroy,
    get mode() { return mode },
    get workProgress() {
      if (mode === 'done') return 1
      if (mode !== 'work') return 0
      return Math.min(1, workElapsed / Math.max(0.001, workDuration))
    },
    /** Position the crew beside the parked vehicle and start the disembark. */
    spawn(park: RouteSample, site: ScienceSite, durationS: number) {
      baseSample = park
      elapsed = 0
      workElapsed = 0
      workDuration = Math.max(0.5, durationS)
      pendingSite = site
      mode = 'exit'
      const toSite = bearingRad(park.lon, park.lat, site.lon, site.lat)
      members.forEach((member, index) => {
        // Step out of the vehicle's flank toward the science target, spread
        // slightly fore/aft so the three do not stack on one spot.
        const exit = offsetLonLat(park.lon, park.lat, toSite, 2.7, (index - 1) * 1.15)
        member.vehicleExit = exit
        member.current = exit
        member.travelFrom = exit
        member.target = exit
        member.inward = toSite
        member.exitHeading = toSite
        member.travelM = 0
        member.progress = 0
        member.exitDelay = index * 0.28
        member.clip = null
        member.model.show = true
      })
    },
    /** Walk from the current position to surround a new site. */
    travelTo(site: ScienceSite, durationS: number) {
      if (mode !== 'work' && mode !== 'done') return
      beginTravel(site, durationS)
    },
    /** Finish up and walk back into the parked vehicle. */
    board() {
      if (mode !== 'work' && mode !== 'done') return
      mode = 'board'
      for (const member of members) {
        member.travelFrom = member.current
        member.target = member.vehicleExit
        member.progress = 0
        member.travelM = Math.max(0.01, distanceMeters(member.current, member.target))
        member.clip = null
      }
    },
    setWeather(rollRad: number, tint: WeatherTint) {
      weatherRoll = rollRad
      weatherTintAmount = tint.amount
      weatherColor.red = tint.color[0]
      weatherColor.green = tint.color[1]
      weatherColor.blue = tint.color[2]
    },
    update(dt: number) {
      if (disposed || members.length === 0 || members.some(member => !member.model.ready)) return
      for (const member of members) {
        member.model.colorBlendMode = ColorBlendMode.MIX
        member.model.color = weatherColor
        member.model.colorBlendAmount = weatherTintAmount
        // These rigs ship with a pistol accessory; hide it for field science.
        const pistol = member.model.getNode('Pistol')
        if (pistol) pistol.show = false
      }
      if (mode === 'off') return
      elapsed += dt

      if (mode === 'exit') {
        for (const member of members) {
          const t = elapsed - member.exitDelay
          if (t < 0) {
            member.model.show = false
            continue
          }
          member.model.show = true
          const airborne = t < JUMP_DURATION
          const clip: Pose = airborne
            ? (t < JUMP_DURATION * JUMP_TAKEOFF_FRACTION ? 'Jump' : 'Jump_Idle')
            : t < JUMP_DURATION + CONTACT_S ? 'Jump_Land' : 'Idle'
          const rate = clip === 'Jump' ? JUMP_CLIP_S / (JUMP_DURATION * JUMP_TAKEOFF_FRACTION)
            : clip === 'Jump_Idle' ? JUMP_IDLE_CLIP_S / (JUMP_DURATION * (1 - JUMP_TAKEOFF_FRACTION))
            : clip === 'Jump_Land' ? LANDING_CLIP_S / CONTACT_S
            : 1
          pose(member, clip, dt, rate)
          const arc = airborne ? Math.sin(Math.PI * Math.min(1, t / JUMP_DURATION)) : 0
          place(member, member.vehicleExit, member.exitHeading, 0.35 * arc)
        }
        if (members.every(member => elapsed - member.exitDelay >= JUMP_DURATION + CONTACT_S)) {
          if (pendingSite) beginTravel(pendingSite, workDuration)
        }
        return
      }

      if (mode === 'travel' || mode === 'board') {
        const boarding = mode === 'board'
        let allArrived = true
        for (const member of members) {
          const speed = travelSpeed(member.travelM)
          member.progress = Math.min(member.travelM, member.progress + dt * speed)
          const f = member.progress / member.travelM
          member.current = {
            lon: lerp(member.travelFrom.lon, member.target.lon, f),
            lat: lerp(member.travelFrom.lat, member.target.lat, f),
          }
          const movingHeading = bearingRad(member.travelFrom.lon, member.travelFrom.lat, member.target.lon, member.target.lat)
          pose(member, 'Walk', dt, Math.min(3, speed / 1.6))
          place(member, member.current, f < 0.94 ? movingHeading : member.inward)
          if (member.progress < member.travelM) allArrived = false
          else if (boarding) member.model.show = false
        }
        if (allArrived) {
          if (boarding) {
            mode = 'off'
          } else {
            mode = 'work'
            workElapsed = 0
          }
        }
        return
      }

      if (mode === 'work') {
        workElapsed += dt
        for (const member of members) {
          pose(member, 'Duck', dt, 1)
          place(member, member.current, member.inward)
        }
        if (workElapsed >= workDuration) mode = 'done'
        return
      }

      // Done: stand around the target, facing inward, until the user boards or
      // selects another nearby site.
      for (const member of members) {
        pose(member, 'Idle', dt, 1)
        place(member, member.current, member.inward)
      }
    },
  }
}

export type ScienceCrew = NonNullable<Awaited<ReturnType<typeof createScienceCrew>>>
