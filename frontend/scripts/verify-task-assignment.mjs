import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithOxc } from 'vite'
import { Axis, Cartesian3, Ellipsoid, Matrix3, Matrix4, Quaternion, Transforms } from 'cesium'

async function moduleUrl(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  let { code } = await transformWithOxc(source, path)
  for (const [name, url] of Object.entries(imports)) code = code.replaceAll(`'${name}'`, JSON.stringify(url)).replaceAll(`"${name}"`, JSON.stringify(url))
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}
const { assignVehicle } = await import(await moduleUrl('../src/map/taskAssignment.ts'))
const benign = { max_grade_deg: 8, slope_compliant: true, dangers: [] }
assert.equal(assignVehicle(benign, 15).vehicle, 'sev')
for (let mask = 1; mask < 8; mask++) {
  const task = { high_physical_risk: !!(mask & 1), strict_contamination: !!(mask & 2), repetitive_work: !!(mask & 4) }
  const result = assignVehicle(benign, 15, task)
  assert.equal(result.vehicle, 'rover')
  assert.equal(result.reasons.length, Object.values(task).filter(Boolean).length)
  assert.equal(result.taskExecutor, 'rover')
}
for (const terrain of [
  { max_grade_deg: 16 }, { ...benign, slope_compliant: false },
  { ...benign, dangers: [{ type: 'cliff', over_limit: false }] },
  { ...benign, dangers: [{ type: 'steep', over_limit: true }] },
]) assert.equal(assignVehicle(terrain, 15).vehicle, 'rover')
assert.equal(assignVehicle({ max_grade_deg: 15.05 }, 15).vehicle, 'sev')

const cesium = import.meta.resolve('cesium')
const trek = await moduleUrl('../src/map/trek.ts', { cesium })
const contactUrl = await moduleUrl('../src/map/roverContact.ts', { cesium, './trek': trek })
const { contactLift } = await import(contactUrl)
const { SEV_BOUNDS, SEV_CONTACTS } = await import(await moduleUrl('../src/map/vehicleModels.ts', { cesium, './roverContact': contactUrl }))
const bytes = await readFile(new URL('../src/3D _assets/Space Exploration Vehicle.glb', import.meta.url))
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)))
const node = gltf.nodes[0]
const axes = Matrix4.multiplyTransformation(Axis.Y_UP_TO_Z_UP, Axis.Z_UP_TO_X_UP, new Matrix4())
const rotation = Matrix4.fromRotationTranslation(Matrix3.fromQuaternion(Quaternion.normalize(new Quaternion(...node.rotation), new Quaternion())))
const matrix = Matrix4.multiply(axes, rotation, new Matrix4())
const bounds = gltf.accessors[gltf.meshes[node.mesh].primitives[0].attributes.POSITION]
for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
  const p = Matrix4.multiplyByPoint(matrix, new Cartesian3(x, y, z), new Cartesian3())
  assert.ok(p.x >= SEV_BOUNDS.minX && p.x <= SEV_BOUNDS.maxX)
  assert.ok(p.y >= SEV_BOUNDS.minY && p.y <= SEV_BOUNDS.maxY)
  assert.ok(p.z >= SEV_BOUNDS.bottomZ)
}
const frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(137.8, -5.4, 0, Ellipsoid.MARS), Ellipsoid.MARS)
const lift = contactLift(frame, () => 0, SEV_CONTACTS)
assert.ok(lift > 2.26 && lift < 2.29)
const grounded = Matrix4.multiplyByTranslation(frame, new Cartesian3(0, 0, lift), new Matrix4())
for (const p of SEV_CONTACTS) assert.ok(Ellipsoid.MARS.cartesianToCartographic(Matrix4.multiplyByPoint(grounded, p, new Cartesian3())).height >= 0.029)
console.log('Passed: all task flag combinations, severe/over-limit terrain assignment, SEV GLB bounds and ground contact.')
