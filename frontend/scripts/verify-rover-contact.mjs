import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithOxc } from 'vite'
import { Axis, Cartesian3, Ellipsoid, Matrix4, Transforms } from 'cesium'

// Load the actual TypeScript implementation without adding a test runner.
async function moduleUrl(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  let { code: outputText } = await transformWithOxc(source, path)
  for (const [name, url] of Object.entries(imports)) {
    outputText = outputText.replaceAll(`'${name}'`, JSON.stringify(url))
      .replaceAll(`"${name}"`, JSON.stringify(url))
  }
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
}
const cesium = import.meta.resolve('cesium')
const trek = await moduleUrl('../src/map/trek.ts', { cesium })
const { contactLift, WHEEL_CONTACTS, WHEEL_BOUNDS } = await import(await moduleUrl('../src/map/roverContact.ts', { cesium, './trek': trek }))
const { surfaceDetail } = await import(await moduleUrl('../src/map/surfaceDetail.ts'))
const mars = Ellipsoid.MARS

// Verify the collision envelope against the actual shipped GLB, including
// node translation and Cesium's Y-up/Z-forward axis conversion.
const glb = await readFile(new URL('../public/models/perseverance.glb', import.meta.url))
const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString())
const wheels = gltf.nodes.find(node => node.name === 'Wheels_objs')
const axes = Matrix4.multiplyTransformation(Axis.Y_UP_TO_Z_UP, Axis.Z_UP_TO_X_UP, new Matrix4())
for (const primitive of gltf.meshes[wheels.mesh].primitives) {
  const bounds = gltf.accessors[primitive.attributes.POSITION]
  for (const extreme of [bounds.min, bounds.max]) {
    const point = Matrix4.multiplyByPoint(axes, Cartesian3.fromArray(extreme.map((v, i) => v + wheels.translation[i])), new Cartesian3())
    assert.ok(point.x >= WHEEL_BOUNDS.minX && point.x <= WHEEL_BOUNDS.maxX)
    assert.ok(point.y >= WHEEL_BOUNDS.minY && point.y <= WHEEL_BOUNDS.maxY)
    assert.ok(point.z >= WHEEL_BOUNDS.bottomZ - 0.000001)
  }
}

for (const [lon, lat, altitude] of [[137.8, -5.4, -4000], [77.4, 18.4, -2500], [-20, 70, 3000]]) {
  const origin = Cartesian3.fromDegrees(lon, lat, altitude, mars)
  const frame = Transforms.eastNorthUpToFixedFrame(origin, mars)
  const inverse = Matrix4.inverseTransformation(frame, new Matrix4())
  // A ridge under only one side: center-point sampling would miss it.
  const ground = (carto) => {
    const local = Matrix4.multiplyByPoint(inverse, mars.cartographicToCartesian(carto), new Cartesian3())
    // Only the outer tread crosses this ridge: the old +/-1.15 m probes
    // completely missed it even though the actual wheels intersected it.
    return altitude + (local.y > 1.25 ? 0.6 : -0.2)
  }
  const lift = contactLift(frame, ground)
  assert.ok(lift > 0.6 && lift < 0.64)
  const corrected = Matrix4.multiplyByTranslation(frame, new Cartesian3(0, 0, lift), new Matrix4())
  for (const point of WHEEL_CONTACTS) {
    const carto = mars.cartesianToCartographic(Matrix4.multiplyByPoint(corrected, point, new Cartesian3()))
    assert.ok(carto.height >= ground(carto) + 0.029, 'wheel penetrates ridge')
  }
  assert.equal(contactLift(frame, () => undefined), 0)
  assert.equal(contactLift(frame, () => NaN), 0)
  assert.equal(surfaceDetail(lon, lat, 10), 0, 'coarse NASA terrain must stay unchanged')
  for (let i = 0; i < 1000; i++) {
    const value = surfaceDetail(lon + i / 59238, lat, 0.1)
    assert.ok(Number.isFinite(value) && Math.abs(value) < 0.91)
    assert.equal(value, surfaceDetail(lon + i / 59238, lat, 0.1))
  }
}

const detail = await moduleUrl('../src/map/surfaceDetail.ts')
const { createMolaTerrainProvider } = await import(await moduleUrl('../src/map/terrain.ts', { cesium, './trek': trek, './surfaceDetail': detail }))
const originalFetch = globalThis.fetch
try {
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new Float32Array(128 * 128).fill(125).buffer })
  const provider = createMolaTerrainProvider()
  assert.equal(provider.cachedHeight(10, 0), undefined)
  await provider.requestTileGeometry(1, 0, 0)
  assert.equal(provider.cachedHeight(10, 0), 125, 'height available before asynchronous globe picking is ready')
  globalThis.fetch = async () => ({ ok: false, status: 503 })
  await assert.rejects(provider.requestTileGeometry(0, 0, 0), /terrain 503/)
  assert.equal(provider.cachedHeight(-10, 0), undefined, 'failed requests must not create zero-height cliffs')
} finally {
  globalThis.fetch = originalFetch
}
console.log('Passed: GLB wheel bounds, outer-tread ridge contact, missing tiles, cached height fallback, failed requests, deterministic relief.')
