import { Color, Material } from 'cesium'

/**
 * Globe-wide stylised Mars surface.
 *
 * Cesium's globe material hook lets us replace the imagery shading for every
 * tile on the planet, so the same graphical landform treatment is visible in
 * the external globe, the SEV/rover chase camera, the on-foot crew view and
 * the traverse preview. Real NASA MOLA geometry, slope and elevation still
 * drive physics and picking; this only changes how the surface is drawn.
 *
 * The shader combines two normals:
 *  - a flat facet normal from screen-space derivatives of the eye position,
 *    which exposes the real terrain mesh as hand-cut low-poly facets, and
 *  - a world-anchored procedural relief normal, which adds the generator's
 *    rocky micro-relief where the real DEM is smooth at close range.
 *
 * Warm dust, iron-oxide regolith, dark basalt on steep faces and pale peaks
 * build the palette, with graphic banded lighting and a distance dust veil
 * that only appears near the surface.
 *
 * NOTE: the source deliberately avoids the tokens `slope` and `normalEC`.
 * Cesium only applies a globe material to terrain providers that advertise
 * vertex normals when the material references either token, and
 * CustomHeightmapTerrainProvider reports no vertex normals. We derive both the
 * facet orientation and steepness ourselves instead.
 */
const SURFACE_SOURCE = `
uniform vec4 dustColor;
uniform vec4 regolithColor;
uniform vec4 basaltColor;
uniform vec4 peakColor;
uniform vec4 dustHazeColor;

float marsHash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float marsNoise(vec3 p) {
    vec3 cell = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float x00 = mix(marsHash(cell + vec3(0.0, 0.0, 0.0)), marsHash(cell + vec3(1.0, 0.0, 0.0)), f.x);
    float x10 = mix(marsHash(cell + vec3(0.0, 1.0, 0.0)), marsHash(cell + vec3(1.0, 1.0, 0.0)), f.x);
    float x01 = mix(marsHash(cell + vec3(0.0, 0.0, 1.0)), marsHash(cell + vec3(1.0, 0.0, 1.0)), f.x);
    float x11 = mix(marsHash(cell + vec3(0.0, 1.0, 1.0)), marsHash(cell + vec3(1.0, 1.0, 1.0)), f.x);
    return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

float marsFbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        value += amplitude * marsNoise(p);
        p = p * 2.03 + vec3(1.7, 9.2, 3.1);
        amplitude *= 0.5;
    }
    return value;
}

// World-anchored procedural relief in metres. Two scales are combined so the
// generator's rolled, rocky ground survives where the NASA DEM is smooth.
float surfaceRelief(vec3 p) {
    return marsFbm(p * 0.045) + marsFbm(p * 0.014 + vec3(3.1, 7.7, 1.3)) * 1.6;
}

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);

    vec3 eyePosition = -materialInput.positionToEyeEC;
    float cameraDistance = length(eyePosition);
    vec4 worldPosition = czm_inverseView * vec4(eyePosition, 1.0);
    vec3 planetNormal = normalize(worldPosition.xyz);
    vec3 viewDirection = normalize(-eyePosition);

    // Real terrain mesh facets (screen-space derivatives of the eye position).
    vec3 facetEye = normalize(cross(dFdx(eyePosition), dFdy(eyePosition)));
    if (dot(facetEye, viewDirection) < 0.0) {
        facetEye = -facetEye;
    }

    // Tangent frame on the planet surface for the procedural relief normal.
    vec3 east = cross(vec3(0.0, 0.0, 1.0), planetNormal);
    float eastLength = length(east);
    east = eastLength > 0.0001 ? east / eastLength : vec3(1.0, 0.0, 0.0);
    vec3 north = cross(planetNormal, east);

    float reliefStep = 2.5;
    float relief0 = surfaceRelief(worldPosition.xyz);
    float reliefEast = surfaceRelief(worldPosition.xyz + east * reliefStep);
    float reliefNorth = surfaceRelief(worldPosition.xyz + north * reliefStep);
    // Strong gradient: at 400 m the DEM is nearly flat, so the procedural
    // relief has to dominate to keep the ground reading as terrain.
    vec3 reliefPlanet = normalize(
        planetNormal
        - east * ((reliefEast - relief0) / reliefStep) * 10.0
        - north * ((reliefNorth - relief0) / reliefStep) * 10.0
    );
    vec3 reliefEye = normalize(mat3(czm_view) * reliefPlanet);

    // Blend the two normals; micro-relief fades out at globe distance.
    float detailFade = 1.0 - smoothstep(40000.0, 350000.0, cameraDistance);
    vec3 visual = normalize(mix(facetEye, reliefEye, 0.6 * detailFade));
    if (dot(visual, viewDirection) < 0.0) {
        visual = -visual;
    }

    float steepness = 1.0 - abs(dot(visual, planetNormal));

    // Camera-relative key/fill light: consistent graphic relief on every side
    // of the planet, no sun terminator and no day/night half-shadow.
    vec3 keyDirection = normalize(vec3(-0.45, 0.62, 0.72));
    vec3 fillDirection = normalize(vec3(0.66, -0.22, 0.42));
    float key = clamp(dot(visual, keyDirection), 0.0, 1.0);
    float fill = clamp(dot(visual, fillDirection), 0.0, 1.0);

    // Mineral mottling and fine grain break up the broad colour bands.
    float mineral = marsFbm(planetNormal * 6.5) * 0.55
                  + marsFbm(worldPosition.xyz * 0.0016) * 0.45;
    float grain = marsFbm(worldPosition.xyz * 0.09);

    vec3 tint = mix(dustColor.rgb, regolithColor.rgb, smoothstep(0.24, 0.80, mineral));
    tint = mix(tint, basaltColor.rgb, smoothstep(0.34, 0.94, steepness) * 0.86);
    float altitude = smoothstep(-1200.0, 12000.0, materialInput.height);
    tint = mix(tint, peakColor.rgb, smoothstep(0.55, 1.0, altitude) * 0.52);
    tint *= 0.90 + grain * 0.20 * detailFade;

    // Graphic three-point light, lightly banded for a hand-painted surface.
    float light = 0.42 + key * 0.70 + fill * 0.18;
    light = mix(light, floor(light * 7.0) / 7.0, 0.26);
    vec3 shaded = tint * light * 1.12;

    // Warm dust veil in the distance, only when the camera is near the ground.
    float cameraAltitude = max(0.0, length(czm_viewerPositionWC) - czm_ellipsoidRadii.x);
    float nearSurface = 1.0 - smoothstep(250000.0, 1500000.0, cameraAltitude);
    float haze = nearSurface * smoothstep(1500.0, 70000.0, cameraDistance);
    shaded = mix(shaded, dustHazeColor.rgb * (0.55 + light * 0.45), haze * 0.5);

    material.diffuse = shaded;
    material.alpha = 1.0;
    return material;
}
`

let sharedMaterial: Material | null = null

/** Create (or reuse) the globe-wide stylised Mars surface material. */
export function createMarsSurfaceMaterial(): Material {
  if (sharedMaterial) return sharedMaterial
  sharedMaterial = new Material({
    fabric: {
      type: 'MarsSurface',
      uniforms: {
        dustColor: Color.fromCssColorString('#c86438'),
        regolithColor: Color.fromCssColorString('#9c4224'),
        basaltColor: Color.fromCssColorString('#47281e'),
        peakColor: Color.fromCssColorString('#dba076'),
        dustHazeColor: Color.fromCssColorString('#c47a4e'),
      },
      source: SURFACE_SOURCE,
    },
  })
  return sharedMaterial
}
