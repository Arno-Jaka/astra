import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Cartesian2, Cartesian3, Color, ConstantProperty, Entity, HorizontalOrigin, VerticalOrigin, SceneTransforms, Math as CesiumMath, ScreenSpaceEventHandler, ScreenSpaceEventType, Viewer } from 'cesium'
import SelectionRings from './SelectionRings'
import SiteSearch from './SiteSearch'
import { MARS } from '../map/trek'
import { useAppStore } from '../store/appStore'
import { ENVIRONMENT_ENTITY_PREFIX } from '../store/environmentMeta'
import { WEATHER_ENTITY_PREFIX } from '../store/weatherEngine'
import { SCIENCE_ENTITY_PREFIX, scienceSiteIdOf } from '../map/scienceFx'
import { useMissionStore } from '../store/missionStore'
import { dispatchLocalCommand, onCommand } from '../ws/commandChannel'

export type Point = { lon: number; lat: number; name?: string; relative?: string; contextSource?: string }
type Inspection = Point & {
  elevation_m: number | null; resolution_km: number | null; note: string
  nearest: { name: string; description: string; distance_km: number; source_url: string; label: string; note: string }
  image_url: string; image_x: number; image_y: number; source_url: string; imagery_source_url: string
  background?: { title: string; text: string; source_url: string; context_site: string }
}
const coordinates = (p: Point) => `${p.lat.toFixed(3)}°, ${p.lon.toFixed(3)}°`

export default function MapExplorer({ viewer }: { viewer: Viewer }) {
  const [card, setCard] = useState<Inspection | null>(null)
  const cardElement = useRef<HTMLDivElement>(null)
  const targetBounds = useRef({ left: 0, right: 0, top: 0, bottom: 0 })
  useLayoutEffect(() => {
    if (!card || !cardElement.current) return
    const element = cardElement.current
    const place = () => {
      const target = targetBounds.current
      const { width, height } = element.getBoundingClientRect()
      const margin = 12
      const positions = [
        { x: target.right + margin, y: target.top },
        { x: target.left - width - margin, y: target.top },
        { x: target.left, y: target.bottom + margin },
        { x: target.left, y: target.top - height - margin },
      ]
      const candidates = positions.map(p => ({ x: Math.max(margin, Math.min(innerWidth - width - margin, p.x)), y: Math.max(margin, Math.min(innerHeight - height - margin, p.y)) }))
      const chosen = candidates.find(p => p.x >= target.right + margin || p.x + width <= target.left - margin || p.y >= target.bottom + margin || p.y + height <= target.top - margin) ?? candidates[0]
      element.style.left = `${chosen.x}px`; element.style.top = `${chosen.y}px`
    }
    place()
    const observer = new ResizeObserver(place); observer.observe(element)
    return () => observer.disconnect()
  }, [card])
  const [imageFailed, setImageFailed] = useState(false)
  const [mode, setMode] = useState<'idle' | 'end' | 'busy'>('idle')
  const [error, setError] = useState('')
  const current = useRef<{ mode: typeof mode; start: Point | null; end: Point | null }>({ mode: 'idle', start: null, end: null })
  const [endpoints, setEndpoints] = useState<{ start: Point | null; end: Point | null }>({ start: null, end: null })
  const selectPoint = useRef<(point: Point, role?: 'start' | 'end') => void>(() => {})
  const routeRequest = useRef<AbortController | null>(null)
  const contextRequests = useRef<Partial<Record<'start' | 'end', AbortController>>>({})
  const phase = useAppStore(s => s.routePhase)
  const reset = () => {
    routeRequest.current?.abort()
    Object.values(contextRequests.current).forEach(controller => controller?.abort())
    current.current = { mode: 'idle', start: null, end: null }
    setEndpoints({ start: null, end: null })
    setMode('idle'); setError('')
    viewer.entities.removeById('explorer-start')
    viewer.entities.removeById('explorer-end')
  }

  useEffect(() => {
    const canvas = viewer.canvas
    const contextControllers = contextRequests.current
    let timer: number | undefined
    let inspection: AbortController | null = null
    let moving = false
    let hovered: Entity | null = null
    let restore = () => {}
    const cancel = () => {
      window.clearTimeout(timer); inspection?.abort()
      restore(); restore = () => {}; hovered = null; setCard(null)
    }
    const pick = (position: Cartesian2): Point | null => {
      const entity = pickVisible(position)
      const world = entity instanceof Entity && (entity.point || entity.label) ? entity.position?.getValue(viewer.clock.currentTime) : undefined
      if (world) {
        const p = MARS.cartesianToCartographic(world)
        return { lon: CesiumMath.toDegrees(p.longitude), lat: CesiumMath.toDegrees(p.latitude), name: entity.id.startsWith('astra-site-') ? entity.id.slice('astra-site-'.length) : undefined }
      }
      const ray = viewer.camera.getPickRay(position)
      const surface = (ray && viewer.scene.globe.pick(ray, viewer.scene)) ?? viewer.camera.pickEllipsoid(position, MARS)
      if (!surface) return null
      const p = MARS.cartesianToCartographic(surface)
      return { lon: CesiumMath.toDegrees(p.longitude), lat: CesiumMath.toDegrees(p.latitude) }
    }
    const blocked = () => moving || useAppStore.getState().routePhase === 'simulating'
    /** Skip screening-overlay, weather-FX and science-marker entities so they never steal a site hover or a map click. */
    const pickVisible = (position: Cartesian2) => {
      for (const picked of viewer.scene.drillPick(position)) {
        const id = picked?.id
        if (id instanceof Entity && (id.id.startsWith(ENVIRONMENT_ENTITY_PREFIX) || id.id.startsWith(WEATHER_ENTITY_PREFIX) || id.id.startsWith(SCIENCE_ENTITY_PREFIX))) continue
        if (id) return id
      }
      return undefined
    }
    const handler = new ScreenSpaceEventHandler(viewer.canvas)
    handler.setInputAction(({ endPosition }: { endPosition: Cartesian2 }) => {
      const picked = pickVisible(endPosition)
      const entity = picked instanceof Entity && (picked.point || picked.label) ? picked : null
      if (blocked() || current.current.mode === 'busy') { cancel(); return }
      if (hovered && entity === hovered) return
      cancel()
      if (!entity) return
      const time = viewer.clock.currentTime
      const world = entity?.position?.getValue(time)
      const location = world && MARS.cartesianToCartographic(world)
      const point = location ? { lon: CesiumMath.toDegrees(location.longitude), lat: CesiumMath.toDegrees(location.latitude) } : null
      if (!point) return
      hovered = entity
      if (entity) {
        const size = entity.point?.pixelSize
        const scale = entity.label?.scale
        if (entity.point) entity.point.pixelSize = new ConstantProperty((size?.getValue(time) ?? 8) * 1.25)
        if (entity.label) entity.label.scale = new ConstantProperty((scale?.getValue(time) ?? 1) * 1.15)
        restore = () => { if (entity.point) entity.point.pixelSize = size; if (entity.label) entity.label.scale = scale }
      }
      const screen = world ? SceneTransforms.worldToWindowCoordinates(viewer.scene, world) ?? endPosition : endPosition
      const canvasBounds = canvas.getBoundingClientRect()
      const x = canvasBounds.left + screen.x, y = canvasBounds.top + screen.y
      const bounds = { left: x - 18, right: x + 18, top: y - 18, bottom: y + 18 }
      if (entity?.label) {
        const label = entity.label
        const context = document.createElement('canvas').getContext('2d')!
        context.font = label.font?.getValue(time) ?? '18px sans-serif'
        const scale = label.scale?.getValue(time) ?? 1
        const text = String(label.text?.getValue(time) ?? '')
        const width = Math.max(...text.split('\n').map(line => context.measureText(line).width)) * scale + 20
        const height = (parseFloat(context.font.match(/\d+(?:\.\d+)?px/)?.[0] ?? '18') + 6) * text.split('\n').length * scale + 12
        const offset = label.pixelOffset?.getValue(time) ?? Cartesian2.ZERO
        const h = label.horizontalOrigin?.getValue(time) ?? HorizontalOrigin.CENTER
        const v = label.verticalOrigin?.getValue(time) ?? VerticalOrigin.CENTER
        const left = x + offset.x - (h === HorizontalOrigin.LEFT ? 0 : h === HorizontalOrigin.RIGHT ? width : width / 2)
        const top = y + offset.y - (v === VerticalOrigin.TOP ? 0 : v === VerticalOrigin.CENTER ? height / 2 : height)
        bounds.left = Math.min(bounds.left, left); bounds.right = Math.max(bounds.right, left + width)
        bounds.top = Math.min(bounds.top, top); bounds.bottom = Math.max(bounds.bottom, top + height)
      }
      targetBounds.current = bounds
      timer = window.setTimeout(async () => {
        if (blocked() || current.current.mode === 'busy') return
        const controller = new AbortController(); inspection = controller
        try {
          const response = await fetch(`/api/locations/inspect?lon=${point.lon}&lat=${point.lat}`, { signal: controller.signal })
          if (!response.ok) throw new Error('Location data unavailable')
          const data = await response.json()
          if (!controller.signal.aborted) { setCard(data); setImageFailed(false) }
        } catch (e) {
          if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Inspection failed')
        }
      }, 1500)
    }, ScreenSpaceEventType.MOUSE_MOVE)
    const select = async (point: Point, role?: 'start' | 'end') => {
      cancel()
      if (useAppStore.getState().routePhase === 'simulating') return
      const { mode: selection } = current.current
      if (selection === 'busy') return
      const target = role ?? (selection === 'end' ? 'end' : 'start')
      const next = { start: current.current.start, end: current.current.end }
      // A new map-click pair replaces the completed pair; explicit search edits keep the other endpoint.
      if (!role && selection === 'idle' && next.start && next.end) next.end = null
      next[target] = point
      if (next.start && next.end && Cartesian3.distance(
        Cartesian3.fromDegrees(next.start.lon, next.start.lat, 0, MARS),
        Cartesian3.fromDegrees(next.end.lon, next.end.lat, 0, MARS),
      ) < 1000) {
        setError('Start and destination must be different locations, at least 1 km apart.')
        return
      }
      if (!next.end) viewer.entities.removeById('explorer-end')
      const id = target === 'start' ? 'explorer-start' : 'explorer-end'
      viewer.entities.removeById(id)
      viewer.entities.add({ id, position: Cartesian3.fromDegrees(point.lon, point.lat, 100, MARS), point: { pixelSize: 12, color: target === 'start' ? Color.CYAN : Color.ORANGE, disableDepthTestDistance: Number.POSITIVE_INFINITY } })
      setEndpoints(next); setError('')
      current.current = { ...next, mode: next.start ? 'end' : 'idle' }
      setMode(current.current.mode)
      contextControllers[target]?.abort()
      const contextController = new AbortController()
      contextControllers[target] = contextController
      void fetch(`/api/locations/context?lon=${point.lon}&lat=${point.lat}`, { signal: contextController.signal })
        .then(async response => {
          if (!response.ok) throw new Error('Nearest-site context unavailable')
          const context = await response.json()
          if (contextController.signal.aborted || current.current[target] !== point) return
          const described = { ...point, relative: context.label, contextSource: context.source_url }
          current.current[target] = described
          setEndpoints(previous => previous[target] === point ? { ...previous, [target]: described } : previous)
        }).catch(() => { /* Coordinates remain usable if the context service is unavailable. */ })
      const origin = next.start, destination = next.end
      if (!origin || !destination) return
      const controller = new AbortController(); routeRequest.current?.abort(); routeRequest.current = controller
      current.current.mode = 'busy'; setMode('busy'); setError('')
      const mission = useMissionStore.getState()
      try {
        const response = await fetch('/api/routes/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ start_lon: origin.lon, start_lat: origin.lat, end_lon: destination.lon, end_lat: destination.lat, max_slope_deg: mission.slopeLimit, crew: mission.crew }) })
        const data = await response.json()
        if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Invalid route inputs')
        if (controller.signal.aborted) return
        await dispatchLocalCommand('show_route', { ...data, start: origin.name ?? data.start, end: destination.name ?? data.end })
        if (!controller.signal.aborted) { current.current.mode = 'idle'; setMode('idle') }
      } catch (e) {
        if (!controller.signal.aborted) { current.current.mode = 'end'; setError(e instanceof Error ? e.message : 'Route failed'); setMode('end') }
      }
    }
    selectPoint.current = (point, role) => { void select(point, role) }
    const unregisterCrewPlan = onCommand('replan_crew_route', async () => {
      if (!current.current.start || !current.current.end) throw new Error('Select a start and destination on the map or in site search first.')
      if (current.current.mode === 'busy') throw new Error('A route is already being calculated.')
      await select(current.current.end, 'end')
    })
    handler.setInputAction(({ position }: { position: Cartesian2 }) => {
      // A science marker has its own click behaviour (detour / move crew), so
      // it must not also pick a new route point underneath the marker.
      if (viewer.scene.drillPick(position).some(picked => scienceSiteIdOf(picked?.id))) return
      const point = pick(position)
      if (point) void select(point)
    }, ScreenSpaceEventType.LEFT_CLICK)
    const removeStart = viewer.camera.moveStart.addEventListener(() => { moving = true; cancel() })
    const removeEnd = viewer.camera.moveEnd.addEventListener(() => { moving = false })
    const unsubscribe = useAppStore.subscribe(s => {
      if (s.routePhase === 'simulating') {
        cancel(); routeRequest.current?.abort(); setMode('idle')
        current.current = { mode: 'idle', start: null, end: null }
        setEndpoints({ start: null, end: null })
      }
    })
    canvas.addEventListener('mouseleave', cancel)
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      cancel(); routeRequest.current?.abort()
      current.current = { mode: 'idle', start: null, end: null }; setMode('idle'); setError('')
      setEndpoints({ start: null, end: null })
      viewer.entities.removeById('explorer-start'); viewer.entities.removeById('explorer-end')
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('resize', cancel)
    return () => {
      cancel(); routeRequest.current?.abort(); handler.destroy(); removeStart(); removeEnd(); unsubscribe()
      unregisterCrewPlan()
      Object.values(contextControllers).forEach(controller => controller?.abort())
      canvas.removeEventListener('mouseleave', cancel)
      window.removeEventListener('resize', cancel)
      window.removeEventListener('keydown', escape)
    }
  }, [viewer])

  return <>
    <SelectionRings viewer={viewer} />
    <SiteSearch endpoints={endpoints} busy={mode === 'busy' || phase === 'simulating'} onSelect={(point, role) => selectPoint.current(point, role)} onReset={reset} />
    {(mode !== 'idle' || error) && <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full bg-neutral-950/90 px-4 py-2 text-xs shadow-lg">
      <span role={error ? 'alert' : 'status'}>{error || (mode === 'end' ? 'Start selected · Click anywhere on Mars for destination' : 'Computing routes…')}</span>
      <button onClick={reset} className="ml-3 text-orange-200 underline">Cancel</button>
    </div>}
    {card && phase !== 'simulating' && <div ref={cardElement} data-panel="inspection" role="tooltip" className="pointer-events-none fixed z-40 w-[280px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-hidden rounded-xl border border-orange-200/25 bg-neutral-950/95 shadow-xl">
      <div className="space-y-2 p-3 text-xs">
        <p className="font-semibold text-orange-200">NASA location inspection</p>
        <p>{coordinates(card)}</p>
        <div className="relative mx-auto w-40">
          {!imageFailed ? <><img src={card.image_url} alt="NASA Viking orbital mosaic around the inspected location" className="aspect-square w-full rounded" onError={() => setImageFailed(true)} /><span className="absolute text-cyan-300" style={{ left: `${card.image_x * 100}%`, top: `${card.image_y * 100}%`, transform: 'translate(-50%, -50%)' }}>⊕</span></> : <p>NASA imagery is currently unavailable.</p>}
        </div>
        <p>Elevation: {card.elevation_m === null ? 'unavailable' : `${Math.round(card.elevation_m)} m (MOLA datum)`}</p>
        {card.background && <div><p className="font-medium text-orange-200">{card.background.title}</p><p>{card.background.text}</p><a href={card.background.source_url} className="underline">Background source · {card.background.context_site}</a></div>}
        <p title={card.nearest.note}>Relative to nearest mapped site: <a href={card.nearest.source_url} target="_blank" rel="noreferrer" className="underline">{card.nearest.label}</a>. {card.nearest.description}</p>
        <p className="text-neutral-400">Named-site context is not a measurement at this point. MOLA resolution: {card.resolution_km?.toFixed(1) ?? 'unknown'} km/pixel. {card.note}</p>
        <p>Sources: <a className="underline" href={card.source_url} target="_blank" rel="noreferrer">NASA MGS/MOLA</a> · <a className="underline" href={card.imagery_source_url} target="_blank" rel="noreferrer">NASA Trek / Viking imagery</a></p>
      </div>
    </div>}
  </>
}
