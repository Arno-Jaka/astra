import { useEffect, useState } from 'react'
import CesiumMap from './map/CesiumMap'
import { connectCommands } from './ws/commandChannel'

type Health = { status: string; service: string }

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => connectCommands(), [])

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div className="relative h-full w-full">
      <CesiumMap />
      <header className="pointer-events-none absolute left-4 top-4 flex items-center gap-3 rounded-md border border-white/10 bg-black/50 px-4 py-2 backdrop-blur">
        <span className="text-lg font-semibold tracking-tight">ASTRA</span>
        <span className="h-4 w-px bg-white/20" />
        {error ? (
          <span className="text-xs text-red-400">backend: {error}</span>
        ) : health ? (
          <span className="text-xs text-emerald-400">backend: {health.status}</span>
        ) : (
          <span className="text-xs text-neutral-400">checking backend…</span>
        )}
      </header>
    </div>
  )
}
