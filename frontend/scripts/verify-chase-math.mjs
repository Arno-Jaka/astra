/* Verification of rover/camera matrix math against the real Cesium build.
 * Run: node scripts/verify-chase-math.mjs (from frontend/)
 */
import { Cartesian3, Ellipsoid, Matrix3, Matrix4, Transforms } from 'cesium'

const MARS = Ellipsoid.MARS
const fmt = (v) => v.toFixed(3)

// --- 1. Matrix3 constructor argument order --------------------------------
const m = new Matrix3(1, 2, 3, 4, 5, 6, 7, 8, 9)
// element index: [0 3 6; 1 4 7; 2 5 8] column-major storage
console.log('Matrix3(1..9) logical rows: [', m[0], m[3], m[6], ']', '[', m[1], m[4], m[7], ']', '[', m[2], m[5], m[8], ']')

// --- 2. Old (pre-rewrite) orientation vs current matrix -------------------
const lon = 137.81
const lat = -5.37
const pos = Cartesian3.fromDegrees(lon, lat, -3000, MARS)
const bearing = 0 // driving north

const oldHpr = Transforms.headingPitchRollToFixedFrame(
  pos,
  { heading: bearing - Math.PI / 2, pitch: 0, roll: 0 },
  MARS,
)

// ENU reference frame
const enu = Transforms.eastNorthUpToFixedFrame(pos, MARS)
const world = (x, y, z) =>
  Matrix4.multiplyByPoint(enu, new Cartesian3(x, y, z), new Cartesian3())

// Current roverMatrix construction (flat ground, no tilt)
const forward = new Cartesian3(Math.sin(bearing), Math.cos(bearing), 0)
const bodyUp = new Cartesian3(0, 0, 1)
const side = Cartesian3.cross(bodyUp, forward, new Cartesian3()) // up x forward
const rotation = new Matrix3(
  forward.x, side.x, bodyUp.x,
  forward.y, side.y, bodyUp.y,
  forward.z, side.z, bodyUp.z,
)
console.log('\ncandidate det (must be ~+1):', fmt(Matrix3.determinant(rotation)))

const frame = Matrix4.multiplyTransformation(
  enu,
  Matrix4.fromRotationTranslation(rotation, new Cartesian3(0, 0, 0)),
  new Matrix4(),
)
const modelForward = Matrix4.multiplyByPoint(
  frame,
  new Cartesian3(1, 0, 0),
  new Cartesian3(),
)
const modelUp = Matrix4.multiplyByPoint(
  frame,
  new Cartesian3(0, 0, 1),
  new Cartesian3(),
)
const oldForward = Matrix4.multiplyByPoint(
  oldHpr,
  new Cartesian3(1, 0, 0),
  new Cartesian3(),
)
const oldUp = Matrix4.multiplyByPoint(oldHpr, new Cartesian3(0, 0, 1), new Cartesian3())

console.log('north in world:', fmt(Cartesian3.magnitude(world(0, 1, 0))) === 'NaN' ? '' : '', 'ok')
const north = world(0, 1, 0)
const zenith = world(0, 0, 1)
console.log('model forward  -> north?', fmt(Cartesian3.dot(modelForward, north)), '(1 = yes)')
console.log('model up       -> zenith?', fmt(Cartesian3.dot(modelUp, zenith)))
console.log('old HPR X axis-> north?', fmt(Cartesian3.dot(oldForward, north)))
console.log('old HPR Z axis-> zenith?', fmt(Cartesian3.dot(oldUp, zenith)))
console.log('candidate == old HPR rotation?', fmt(Cartesian3.dot(modelForward, oldForward)))

// --- 3. bearing wrap sanity -------------------------------------------------
const wrapPi = (angle) => {
  const twoPi = Math.PI * 2
  return (((angle % twoPi) + twoPi + Math.PI) % twoPi) - Math.PI
}
console.log('\nwrapPi(0) =', fmt(wrapPi(0)), '(expect 0.000)')
console.log('wrapPi(pi) =', fmt(wrapPi(Math.PI)), '(expect ~±3.142)')
console.log('wrapPi(-3pi/2) =', fmt(wrapPi(-3 * Math.PI / 2)), '(expect 1.571)')

const buggy = (bd) =>
  ((bd + Math.PI) % (Math.PI * 2) + Math.PI * 2) % Math.PI * 2 - Math.PI
console.log('existing inline wrap, delta=0 ->', fmt(buggy(0)), '(expect 0.000 — shows the bug if not)')
console.log('existing inline wrap, delta=0.01 ->', fmt(buggy(0.01)))
