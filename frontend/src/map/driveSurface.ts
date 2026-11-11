import { Cartesian3, Color, ColorMaterialProperty, ConstantProperty, Material, Viewer } from 'cesium'
import { sampleRoute, type TraversableRoute } from './routePath'
import { MARS } from './trek'

/** Illustrative, world-anchored visual detail; does not modify NASA heights.
 * Local tile texture coordinates would swim as terrain LOD changes, so the
 * surface pattern is evaluated in Mars-fixed coordinates instead.
 */
export function createDriveSurface(viewer: Viewer, route: TraversableRoute) {
  const previousMaterial = viewer.scene.globe.material
  const material = new Material({
    fabric: {
      type: 'AstraScoutSurface',
      source: `
        float astraHash(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float astraNoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(astraHash(i), astraHash(i+vec3(1,0,0)), f.x),
                mix(astraHash(i+vec3(0,1,0)), astraHash(i+vec3(1,1,0)), f.x), f.y),
            mix(mix(astraHash(i+vec3(0,0,1)), astraHash(i+vec3(1,0,1)), f.x),
                mix(astraHash(i+vec3(0,1,1)), astraHash(i+vec3(1,1,1)), f.x), f.y), f.z);
        }
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material result = czm_getDefaultMaterial(materialInput);
          float range = length(materialInput.positionToEyeEC);
          result.alpha = 0.0;
          if (range < 650.0) {
            vec3 world = (czm_inverseView * vec4(-materialInput.positionToEyeEC, 1.0)).xyz;
            float patches = astraNoise(world * 0.035);
            float gravel = astraNoise(world * 0.32);
            float pattern = smoothstep(0.2, 0.8, patches * 0.55 + gravel * 0.45);
            result.diffuse = mix(vec3(0.16, 0.075, 0.035), vec3(0.66, 0.43, 0.26), pattern);
            result.alpha = 0.48 * (1.0 - smoothstep(120.0, 650.0, range));
          }
          return result;
        }
      `,
    },
  })
  viewer.scene.globe.material = material
  const tracks = [-1.18, 1.18].map((offset, index) => ({
    offset,
    entity: viewer.entities.add({
      id: `astra-wheel-trail-${index}`,
      polyline: {
        positions: [],
        width: 3,
        material: Color.fromCssColorString('#372016').withAlpha(0.8),
        clampToGround: true,
      },
    }),
  }))
  const history: { distance: number; born: number; positions: Cartesian3[] }[] = []
  const totalM = (route.profile.at(-1)?.distance_km ?? 0) * 1000
  let lastDistance: number | undefined
  let lastUpdate = -Infinity
  let lastFade = 0
  const removeFade = viewer.scene.preRender.addEventListener(() => {
    const now = performance.now()
    if (now - lastFade < 150) return
    lastFade = now
    let changed = false
    while (history.length && now - history[0].born > 18000) { history.shift(); changed = true }
    const age = history.length ? now - history[history.length - 1].born : 18000
    const alpha = 0.8 * Math.max(0, 1 - Math.max(0, age - 6000) / 12000)
    tracks.forEach(({ entity }, index) => {
      entity.polyline!.material = new ColorMaterialProperty(Color.fromCssColorString('#372016').withAlpha(alpha))
      if (changed) entity.polyline!.positions = new ConstantProperty(history.map(point => point.positions[index]))
    })
  })

  return {
    update(distanceM: number, now: number) {
      if (lastDistance !== undefined && (distanceM - lastDistance < 0.5 || now - lastUpdate < 100)) return
      const start = lastDistance ?? distanceM
      const count = Math.max(1, Math.min(24, Math.ceil((distanceM - start) / 2)))
      for (let index = 1; index <= count; index++) {
        const distance = start + (distanceM - start) * index / count
        const sample = sampleRoute(route, totalM > 0 ? distance / totalM : 0)
        history.push({
          distance,
          born: now,
          positions: tracks.map(({ offset }) => Cartesian3.fromDegrees(
            sample.lon + Math.cos(sample.bearing) * offset / (59238 * Math.max(0.1, Math.cos(sample.lat * Math.PI / 180))),
            sample.lat - Math.sin(sample.bearing) * offset / 59238,
            0, MARS,
          )),
        })
      }
      while (history.length > 2 && (history[1].distance < distanceM - 200 || history.length > 256)) history.shift()
      tracks.forEach(({ entity }, index) => {
        entity.polyline!.positions = new ConstantProperty(history.map(point => point.positions[index]))
      })
      lastDistance = distanceM
      lastUpdate = now
    },
    destroy() {
      removeFade()
      for (const { entity } of tracks) viewer.entities.remove(entity)
      if (viewer.scene.globe.material === material) viewer.scene.globe.material = previousMaterial
      material.destroy()
    },
  }
}
