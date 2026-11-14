import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../store/appStore'
import { useDriveStore } from '../store/driveStore'

/**
 * Three.js terrain view for route preview/simulation modes.
 * Based on the provided procedural Mars landform generator (dust haze, no sliders),
 * with route/profile elevation influence for the active traverse/site.
 */
export default function TerrainSimulationView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const route = useAppStore((s) => s.route)
  const routeChoice = useAppStore((s) => s.routeChoice)
  const previewT = useAppStore((s) => s.previewT)
  const routePhase = useAppStore((s) => s.routePhase)
  const driveDistanceKm = useDriveStore((s) => s.distanceKm)
  const driveTotalKm = useDriveStore((s) => s.totalKm)
  const active = useDriveStore((s) => s.active)

  const traverse = useMemo(() => {
    if (!route) return null
    return routeChoice === 'hazardous' && route.hazardous ? route.hazardous : route
  }, [route, routeChoice])

  const progressT = useMemo(() => {
    if (active && driveTotalKm > 0) return Math.min(1, Math.max(0, driveDistanceKm / driveTotalKm))
    return previewT
  }, [active, driveDistanceKm, driveTotalKm, previewT])

  const siteKey = (route?.end || route?.start || 'mars').toLowerCase()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const params = {
      seed: 42,
      mountainHeight: 1.0,
      hillRoughness: 1.0,
      rockDensity: 1.0,
      dustHaze: 0.0085,
    }

    // Site-aware presets for prominent Mars locations (procedural styling to evoke site character).
    const presets: Record<string, Partial<typeof params>> = {
      'gale crater': { seed: 137, mountainHeight: 1.2, hillRoughness: 0.9, rockDensity: 0.9, dustHaze: 0.008 },
      'mount sharp': { seed: 138, mountainHeight: 1.7, hillRoughness: 1.0, rockDensity: 0.8, dustHaze: 0.0075 },
      'jezero crater': { seed: 77, mountainHeight: 0.8, hillRoughness: 1.0, rockDensity: 1.0, dustHaze: 0.009 },
      'olympus mons': { seed: 226, mountainHeight: 1.8, hillRoughness: 0.7, rockDensity: 0.6, dustHaze: 0.006 },
      'valles marineris': { seed: 301, mountainHeight: 1.6, hillRoughness: 1.3, rockDensity: 1.1, dustHaze: 0.009 },
      'hellas planitia': { seed: 70, mountainHeight: 0.7, hillRoughness: 0.8, rockDensity: 0.9, dustHaze: 0.01 },
      'elysium mons': { seed: 147, mountainHeight: 1.4, hillRoughness: 0.8, rockDensity: 0.7, dustHaze: 0.0075 },
      'gusev crater': { seed: 175, mountainHeight: 0.9, hillRoughness: 1.0, rockDensity: 1.0, dustHaze: 0.009 },
      'meridiani planum': { seed: 357, mountainHeight: 0.5, hillRoughness: 0.7, rockDensity: 0.8, dustHaze: 0.0085 },
    }
    for (const [name, preset] of Object.entries(presets)) {
      if (siteKey.includes(name)) Object.assign(params, preset)
    }

    // Influence terrain from route elevation profile (real MOLA/DEM-derived traverse data).
    const profile = traverse?.profile ?? []
    const elevations = profile.map((p) => p.elevation_m).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    const grades = profile.map((p) => p.grade_deg).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (elevations.length >= 2) {
      const minE = Math.min(...elevations)
      const maxE = Math.max(...elevations)
      const relief = Math.max(0, maxE - minE)
      const maxGrade = grades.length ? Math.max(...grades.map(Math.abs)) : 0
      params.mountainHeight = Math.min(1.8, Math.max(0.4, params.mountainHeight * (0.7 + relief / 6000)))
      params.hillRoughness = Math.min(1.8, Math.max(0.4, params.hillRoughness * (0.7 + maxGrade / 30)))
    }

    const scene = new THREE.Scene()
    const skyColor = new THREE.Color(0xc87448)
    scene.background = skyColor
    scene.fog = new THREE.FogExp2(0xc46d40, params.dustHaze)

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight || 1, 0.5, 1000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    container.appendChild(renderer.domElement)

    const hemiLight = new THREE.HemisphereLight(0xe89b6b, 0x4a1d0d, 0.75)
    scene.add(hemiLight)
    const sunLight = new THREE.DirectionalLight(0xffdfb8, 2.4)
    sunLight.position.set(120, 85, -110)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = 2048
    sunLight.shadow.mapSize.height = 2048
    sunLight.shadow.camera.near = 10
    sunLight.shadow.camera.far = 450
    const d = 160
    sunLight.shadow.camera.left = -d
    sunLight.shadow.camera.right = d
    sunLight.shadow.camera.top = d
    sunLight.shadow.camera.bottom = -d
    sunLight.shadow.bias = -0.0005
    scene.add(sunLight)
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(12, 32), new THREE.MeshBasicMaterial({ color: 0xfff0dd, fog: false }))
    sunDisc.position.copy(sunLight.position).normalize().multiplyScalar(420)
    sunDisc.lookAt(0, 0, 0)
    scene.add(sunDisc)

    const createNoise2D = (seedVal: number) => {
      const hash = (x: number, y: number) => {
        const n = Math.sin(x * 127.1 + y * 311.7 + seedVal * 74.7) * 43758.5453123
        return n - Math.floor(n)
      }
      const smoothNoise = (x: number, y: number) => {
        const ix = Math.floor(x), iy = Math.floor(y)
        const fx = x - ix, fy = y - iy
        const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
        const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
        return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
      }
      const fbm = (x: number, y: number, octaves = 5) => {
        let value = 0, amp = 0.5, freq = 1
        for (let i = 0; i < octaves; i++) { value += amp * (smoothNoise(x * freq, y * freq) * 2 - 1); freq *= 2.04; amp *= 0.5 }
        return value
      }
      const ridged = (x: number, y: number, octaves = 5) => {
        let value = 0, amp = 0.5, freq = 1, weight = 1
        for (let i = 0; i < octaves; i++) {
          let signal = 1 - Math.abs(smoothNoise(x * freq, y * freq) * 2 - 1)
          signal *= signal; signal *= weight; weight = Math.max(0, Math.min(1, signal * 1.8))
          value += signal * amp; freq *= 2.12; amp *= 0.5
        }
        return value
      }
      return { hash, fbm, ridged }
    }

    let terrainMesh: THREE.Mesh | null = null
    let rockInstancedMeshes: THREE.InstancedMesh[] = []

    const buildMarsLandscape = () => {
      if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); (terrainMesh.material as THREE.Material).dispose() }
      rockInstancedMeshes.forEach((m) => { scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose() })
      rockInstancedMeshes = []

      const noise = createNoise2D(params.seed)
      const terrainSize = 320
      const segments = 240
      const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments)
      geo.rotateX(-Math.PI / 2)
      const posAttr = geo.attributes.position
      const colors = new Float32Array(posAttr.count * 3)

      const craters: { x: number; z: number; radius: number; depth: number }[] = []
      for (let c = 0; c < 10; c++) {
        craters.push({
          x: (noise.hash(c, 1.3) - 0.5) * (terrainSize * 0.72),
          z: (noise.hash(c, 7.9) - 0.5) * (terrainSize * 0.72),
          radius: 7 + noise.hash(c, 4.1) * 18,
          depth: 1.8 + noise.hash(c, 9.2) * 3.5,
        })
      }

      // Sample route profile into a local relief strip so contours reflect traverse data.
      const profileSamples = (() => {
        if (elevations.length < 2) return null
        const minE = Math.min(...elevations), maxE = Math.max(...elevations)
        const scale = Math.max(1, maxE - minE)
        return profile
          .map((p, i) => ({ t: profile.length > 1 ? i / (profile.length - 1) : 0, h: typeof p.elevation_m === 'number' ? (p.elevation_m - minE) / scale : 0.5, g: Math.abs(p.grade_deg ?? 0) }))
      })()

      const routeRelief = (x: number, z: number) => {
        if (!profileSamples || profileSamples.length < 2) return 0
        // Route runs roughly along local -Z to +Z axis through center corridor.
        const t = Math.max(0, Math.min(1, (z + terrainSize * 0.35) / (terrainSize * 0.7)))
        const idx = t * (profileSamples.length - 1)
        const i0 = Math.floor(idx), i1 = Math.min(profileSamples.length - 1, i0 + 1)
        const f = idx - i0
        const s0 = profileSamples[i0], s1 = profileSamples[i1]
        const h = s0.h + (s1.h - s0.h) * f
        const g = s0.g + (s1.g - s0.g) * f
        const corridor = Math.exp(-Math.pow(x / 28, 2))
        return corridor * ((h - 0.5) * 18 * params.mountainHeight + (g / 25) * 6 * params.hillRoughness)
      }

      const getElevation = (x: number, z: number) => {
        const distFromCenter = Math.hypot(x, z)
        const rimFactor = Math.max(0, (distFromCenter - 45) / 115)
        const bigMountainMask = Math.pow(Math.max(0, noise.fbm(x * 0.008 + 3.1, z * 0.008 - 1.7, 3) + 0.45), 1.7)
        const bigMountains = noise.ridged(x * 0.011, z * 0.011, 5) * 34.0 * params.mountainHeight * (0.35 + rimFactor * 1.15) * bigMountainMask
        const smallMountainMask = Math.max(0, noise.fbm(x * 0.022 - 5.4, z * 0.022 + 2.8, 3) + 0.25)
        const smallMountains = noise.ridged(x * 0.028 + 11.2, z * 0.028 - 8.6, 4) * 13.5 * params.mountainHeight * smallMountainMask
        const bigHills = (noise.fbm(x * 0.024, z * 0.024, 4) * 0.65 + noise.ridged(x * 0.032, z * 0.032, 3) * 0.35) * 8.5 * params.hillRoughness
        const smallHills = noise.fbm(x * 0.075 + 4.2, z * 0.075 - 3.9, 4) * 2.4 * params.hillRoughness
        const rockyGround = noise.ridged(x * 0.24, z * 0.24, 3) * 0.55 * params.hillRoughness + noise.fbm(x * 0.65, z * 0.65, 2) * 0.22 * params.hillRoughness
        let height = bigMountains + smallMountains + bigHills + smallHills + rockyGround + routeRelief(x, z)
        for (let c = 0; c < craters.length; c++) {
          const cr = craters[c]; const distC = Math.hypot(x - cr.x, z - cr.z)
          if (distC < cr.radius * 1.45) {
            const norm = distC / cr.radius
            if (norm < 1) height += (norm * norm - 1) * cr.depth
            else height += Math.exp(-Math.pow((norm - 1.05) * 5, 2)) * (cr.depth * 0.35)
          }
        }
        return height
      }

      for (let i = 0; i < posAttr.count; i++) posAttr.setY(i, getElevation(posAttr.getX(i), posAttr.getZ(i)))
      geo.computeVertexNormals()
      const normAttr = geo.attributes.normal
      const colorDust = new THREE.Color(0xc86438), colorRegolith = new THREE.Color(0x9c4224), colorBasalt = new THREE.Color(0x47281e), colorPeak = new THREE.Color(0xdba076), tempColor = new THREE.Color()
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i), ny = normAttr.getY(i)
        const slope = 1 - Math.max(0, Math.min(1, ny))
        const mineralPatch = noise.fbm(x * 0.05, z * 0.05, 3) * 0.5 + 0.5
        tempColor.copy(colorDust).lerp(colorRegolith, mineralPatch * 0.75)
        tempColor.lerp(colorBasalt, Math.min(1, Math.pow(slope * 2.4, 1.4)) * 0.88)
        if (y > 14) tempColor.lerp(colorPeak, Math.min(1, (y - 14) / 22) * (1 - Math.min(1, Math.pow(slope * 2.4, 1.4)) * 0.5) * 0.55)
        colors[i * 3] = tempColor.r; colors[i * 3 + 1] = tempColor.g; colors[i * 3 + 2] = tempColor.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      terrainMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.04, flatShading: true }))
      terrainMesh.receiveShadow = true; terrainMesh.castShadow = true
      scene.add(terrainMesh)

      // Rocks/boulders (reduced count for performance in app view)
      const createRockGeometry = (rockSeed: number) => {
        const rockGeo = new THREE.IcosahedronGeometry(1, 1)
        const rPos = rockGeo.attributes.position
        const rNoise = createNoise2D(rockSeed)
        for (let i = 0; i < rPos.count; i++) {
          const vx = rPos.getX(i), vy = rPos.getY(i), vz = rPos.getZ(i)
          const n = 0.72 + rNoise.fbm(vx * 1.8 + vy, vz * 1.8 - vy, 3) * 0.48
          rPos.setXYZ(i, vx * n, vy * n * 0.72, vz * n)
        }
        rockGeo.computeVertexNormals()
        return rockGeo
      }
      const rockVariants = [createRockGeometry(params.seed + 101), createRockGeometry(params.seed + 202), createRockGeometry(params.seed + 303)]
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b3524, roughness: 0.92, metalness: 0.05, flatShading: true })
      const totalRocks = Math.floor(900 * params.rockDensity)
      const rocksPerVariant = Math.max(1, Math.floor(totalRocks / rockVariants.length))
      const dummy = new THREE.Object3D(), rockTint = new THREE.Color()
      rockVariants.forEach((variantGeo, vIdx) => {
        const instMesh = new THREE.InstancedMesh(variantGeo, rockMat, rocksPerVariant)
        instMesh.castShadow = true; instMesh.receiveShadow = true
        for (let i = 0; i < rocksPerVariant; i++) {
          const idx = vIdx * rocksPerVariant + i
          const rx = (noise.hash(idx, 1.1) - 0.5) * (terrainSize * 0.9)
          const rz = (noise.hash(idx, 2.3) - 0.5) * (terrainSize * 0.9)
          const ry = getElevation(rx, rz)
          const sizeRoll = Math.pow(noise.hash(idx, 3.7), 3.4)
          const scaleBase = 0.22 + sizeRoll * 3.1
          dummy.position.set(rx, ry - scaleBase * 0.18, rz)
          dummy.rotation.set(noise.hash(idx, 4.1) * Math.PI, noise.hash(idx, 5.2) * Math.PI * 2, noise.hash(idx, 6.3) * Math.PI)
          dummy.scale.set(scaleBase * (0.8 + noise.hash(idx, 7.4) * 0.6), scaleBase * (0.65 + noise.hash(idx, 8.5) * 0.5), scaleBase * (0.8 + noise.hash(idx, 9.6) * 0.6))
          dummy.updateMatrix(); instMesh.setMatrixAt(i, dummy.matrix)
          const shade = 0.65 + noise.hash(idx, 10.7) * 0.55
          rockTint.setRGB(0.45 * shade, 0.22 * shade, 0.15 * shade); instMesh.setColorAt(i, rockTint)
        }
        instMesh.instanceMatrix.needsUpdate = true
        if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true
        scene.add(instMesh); rockInstancedMeshes.push(instMesh)
      })

      // Route/progress marker (visual aid over terrain corridor)
      const markerZ = -terrainSize * 0.35 + progressT * terrainSize * 0.7
      const markerY = getElevation(0, markerZ)
      const marker = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 20), new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0b4f5a, roughness: 0.4 }))
      marker.position.set(0, markerY + 1.4, markerZ)
      marker.castShadow = true
      scene.add(marker)
    }

    buildMarsLandscape()

    // Camera controls (integrated orbit/pan/zoom)
    let isDragging = false, isPanning = false, prevX = 0, prevY = 0
    const spherical = { radius: 88, theta: 0.65, phi: 1.24 }
    const target = new THREE.Vector3(0, 6, 0)
    const updateCameraPosition = () => {
      spherical.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.04, spherical.phi))
      spherical.radius = Math.max(14, Math.min(210, spherical.radius))
      camera.position.x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta)
      camera.position.y = target.y + spherical.radius * Math.cos(spherical.phi)
      camera.position.z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta)
      camera.lookAt(target)
    }
    updateCameraPosition()

    const onPointerDown = (e: PointerEvent) => { isDragging = true; isPanning = e.button === 2 || e.shiftKey; prevX = e.clientX; prevY = e.clientY }
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return
      const dx = e.clientX - prevX, dy = e.clientY - prevY; prevX = e.clientX; prevY = e.clientY
      if (isPanning) {
        const panSpeed = spherical.radius * 0.0012
        const right = new THREE.Vector3(); camera.getWorldDirection(right); right.cross(camera.up).normalize()
        target.addScaledVector(right, -dx * panSpeed)
        target.y = Math.max(-5, Math.min(45, target.y + dy * panSpeed))
      } else { spherical.theta -= dx * 0.0055; spherical.phi -= dy * 0.0055 }
      updateCameraPosition()
    }
    const onPointerUp = () => { isDragging = false; isPanning = false }
    const onWheel = (e: WheelEvent) => { e.preventDefault(); spherical.radius += e.deltaY * 0.06; updateCameraPosition() }
    const onContextMenu = (e: MouseEvent) => e.preventDefault()

    const domElem = renderer.domElement
    domElem.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    domElem.addEventListener('wheel', onWheel, { passive: false })
    domElem.addEventListener('contextmenu', onContextMenu)

    const handleResize = () => {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight || 1
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    let animId = 0
    const animate = () => { animId = requestAnimationFrame(animate); renderer.render(scene, camera) }
    animate()

    return () => {
      window.removeEventListener('resize', handleResize)
      domElem.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      domElem.removeEventListener('wheel', onWheel)
      domElem.removeEventListener('contextmenu', onContextMenu)
      cancelAnimationFrame(animId)
      renderer.dispose()
      if (domElem && container.contains(domElem)) container.removeChild(domElem)
    }
  }, [siteKey, traverse, progressT, routePhase])

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />
}
