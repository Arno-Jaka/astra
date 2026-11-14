import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type Point = { x: number; y: number }

const MARGIN = 12
const GAP = 10
const rectsOverlap = (a: DOMRect, b: DOMRect) =>
  a.left < b.right + GAP && a.right + GAP > b.left && a.top < b.bottom + GAP && a.bottom + GAP > b.top

/** Shared mouse/touch/keyboard HUD docking. Panels avoid overlapping other panels and stay near screen edges. */
export default function FloatingPanel({ id, title, width, initial, children, defaultCollapsed = false }: {
  id: string; title: string; width: number; initial: CSSProperties; children: ReactNode; defaultCollapsed?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; origin: Point; start: Point } | null>(null)
  const [position, setPosition] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const constrain = (point: Point) => {
    const rect = ref.current?.getBoundingClientRect()
    return {
      x: Math.max(MARGIN, Math.min(window.innerWidth - (rect?.width ?? width) - MARGIN, point.x)),
      y: Math.max(MARGIN, Math.min(window.innerHeight - (rect?.height ?? 40) - MARGIN, point.y)),
    }
  }

  const overlapsOthers = (point: Point) => {
    const self = ref.current
    if (!self) return false
    const rect = self.getBoundingClientRect()
    const probe = { left: point.x, top: point.y, right: point.x + rect.width, bottom: point.y + rect.height } as DOMRect
    for (const element of document.querySelectorAll<HTMLElement>('[data-panel]')) {
      if (element === self) continue
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (rectsOverlap(probe, element.getBoundingClientRect())) return true
    }
    return false
  }

  const deoverlap = (point: Point) => {
    let candidate = constrain(point)
    if (!overlapsOthers(candidate)) return candidate
    const self = ref.current
    const rect = self?.getBoundingClientRect()
    const w = rect?.width ?? width
    const h = rect?.height ?? 120
    const maxX = Math.max(MARGIN, window.innerWidth - w - MARGIN)
    const maxY = Math.max(MARGIN, window.innerHeight - h - MARGIN)
    const preferRight = candidate.x > window.innerWidth / 2
    const columns = preferRight ? [maxX, MARGIN, (MARGIN + maxX) / 2] : [MARGIN, maxX, (MARGIN + maxX) / 2]
    for (const x of columns) {
      for (let y = MARGIN; y <= maxY; y += 24) {
        const next = { x, y }
        if (!overlapsOthers(next)) return next
      }
    }
    // Last resort: scan from current position downward then upward.
    for (let dy = 0; dy <= window.innerHeight; dy += 24) {
      for (const sign of [1, -1]) {
        const next = constrain({ x: candidate.x, y: candidate.y + dy * sign })
        if (!overlapsOthers(next)) return next
      }
    }
    return candidate
  }

  const place = (point: Point, persist = true) => {
    const p = deoverlap(point)
    setPosition(p)
    if (persist) {
      try { sessionStorage.setItem(`astra-panel-${id}`, JSON.stringify(p)) } catch { /* storage optional */ }
    }
  }

  const snap = (point: Point) => {
    const p = constrain(point)
    const rect = ref.current!.getBoundingClientRect()
    const right = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN)
    const bottom = Math.max(MARGIN, window.innerHeight - rect.height - MARGIN)
    const distances = [p.x - MARGIN, right - p.x, p.y - MARGIN, bottom - p.y]
    switch (distances.indexOf(Math.min(...distances))) {
      case 0: p.x = MARGIN; break
      case 1: p.x = right; break
      case 2: p.y = MARGIN; break
      case 3: p.y = bottom; break
    }
    place(p)
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`astra-panel-${id}`) ?? 'null')
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) setPosition(constrain(saved))
    } catch { /* stale preferences */ }
    const resize = () => setPosition(p => {
      const rect = ref.current?.getBoundingClientRect()
      if (!p && (!rect || (rect.left >= MARGIN && rect.top >= MARGIN && rect.right <= window.innerWidth - MARGIN && rect.bottom <= window.innerHeight - MARGIN))) return p
      const next = deoverlap(p ?? { x: rect!.left, y: rect!.top })
      return p?.x === next.x && p?.y === next.y ? p : next
    })
    window.addEventListener('resize', resize)
    const observer = new ResizeObserver(resize)
    if (ref.current) observer.observe(ref.current)
    return () => { window.removeEventListener('resize', resize); observer.disconnect() }
    // Panel identity is fixed for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useLayoutEffect(() => {
    if (dragging || !ref.current) return
    const idFrame = requestAnimationFrame(() => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const base = position ?? { x: rect.left, y: rect.top }
      const next = deoverlap(base)
      if (Math.abs(next.x - base.x) > 1 || Math.abs(next.y - base.y) > 1) setPosition(next)
    })
    return () => cancelAnimationFrame(idFrame)
  })
  return <div ref={ref} data-panel={id} className="pointer-events-auto fixed z-30 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-white/15 bg-neutral-950/85 shadow-2xl backdrop-blur-xl"
    style={{ width, ...(!position ? initial : { left: position.x, top: position.y }), maxHeight: 'calc(100dvh - 24px)', transition: dragging ? 'none' : 'left 240ms ease-out, top 240ms ease-out', zIndex: dragging ? 60 : 30 }}>
    <div className="flex items-center border-b border-white/10 bg-white/[0.04]">
      <button type="button" aria-label={`Move ${title}; arrow keys move, Enter docks, Home resets`} className="min-w-0 flex-1 cursor-grab touch-none select-none px-3 py-2 text-left text-xs font-semibold uppercase tracking-widest text-neutral-200 active:cursor-grabbing"
        onPointerDown={event => {
          if (event.button !== 0) return
          const r = ref.current!.getBoundingClientRect()
          drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: r.left, y: r.top } }
          setPosition({ x: r.left, y: r.top }); setDragging(true)
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const d = drag.current
          if (d?.pointer === event.pointerId) setPosition(constrain({ x: d.origin.x + event.clientX - d.start.x, y: d.origin.y + event.clientY - d.start.y }))
        }}
        onPointerUp={event => {
          if (!drag.current) return
          const d = drag.current; drag.current = null; setDragging(false)
          snap({ x: d.origin.x + event.clientX - d.start.x, y: d.origin.y + event.clientY - d.start.y })
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => { drag.current = null; setDragging(false) }}
        onKeyDown={event => {
          const r = ref.current!.getBoundingClientRect()
          const p = { x: r.left, y: r.top }
          if (event.key === 'Home') { setPosition(null); sessionStorage.removeItem(`astra-panel-${id}`) }
          else if (event.key === 'Enter') snap(p)
          else if (event.key.startsWith('Arrow')) {
            if (event.key === 'ArrowLeft') p.x -= 20
            if (event.key === 'ArrowRight') p.x += 20
            if (event.key === 'ArrowUp') p.y -= 20
            if (event.key === 'ArrowDown') p.y += 20
            setPosition(constrain(p))
          } else return
          event.preventDefault(); event.stopPropagation()
        }}>⠿ {title}</button>
      <button type="button" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title}`} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)} className="px-3 py-2 text-neutral-300">{collapsed ? '+' : '−'}</button>
    </div>
    <div hidden={collapsed} className="overflow-auto" style={{ maxHeight: 'calc(100dvh - 66px)' }}>{children}</div>
  </div>
}
