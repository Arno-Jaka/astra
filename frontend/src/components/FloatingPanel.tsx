import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type Point = { x: number; y: number }
/** Shared mouse/touch/keyboard HUD docking. Only the handle captures dragging. */
export default function FloatingPanel({ id, title, width, initial, children }: {
  id: string; title: string; width: number; initial: CSSProperties; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; origin: Point; start: Point } | null>(null)
  const [position, setPosition] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const constrain = (point: Point) => {
    const rect = ref.current?.getBoundingClientRect()
    return { x: Math.max(12, Math.min(window.innerWidth - (rect?.width ?? width) - 12, point.x)),
      y: Math.max(12, Math.min(window.innerHeight - (rect?.height ?? 40) - 12, point.y)) }
  }
  const snap = (point: Point) => {
    const p = constrain(point)
    const rect = ref.current!.getBoundingClientRect()
    const right = Math.max(12, window.innerWidth - rect.width - 12)
    const bottom = Math.max(12, window.innerHeight - rect.height - 12)
    const distances = [p.x - 12, right - p.x, p.y - 12, bottom - p.y]
    switch (distances.indexOf(Math.min(...distances))) {
      case 0: p.x = 12; break
      case 1: p.x = right; break
      case 2: p.y = 12; break
      case 3: p.y = bottom; break
    }
    setPosition(p)
    try { sessionStorage.setItem(`astra-panel-${id}`, JSON.stringify(p)) } catch { /* storage optional */ }
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`astra-panel-${id}`) ?? 'null')
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) setPosition(constrain(saved))
    } catch { /* stale preferences */ }
    const resize = () => setPosition(p => {
      const rect = ref.current?.getBoundingClientRect()
      if (!p && (!rect || (rect.left >= 12 && rect.top >= 12 && rect.right <= window.innerWidth - 12 && rect.bottom <= window.innerHeight - 12))) return p
      const next = constrain(p ?? { x: rect!.left, y: rect!.top })
      return p?.x === next.x && p?.y === next.y ? p : next
    })
    window.addEventListener('resize', resize)
    const observer = new ResizeObserver(resize)
    if (ref.current) observer.observe(ref.current)
    return () => { window.removeEventListener('resize', resize); observer.disconnect() }
    // Panel identity is fixed for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
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
