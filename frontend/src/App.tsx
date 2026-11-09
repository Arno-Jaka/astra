import { useEffect, useState } from 'react'

type Health = { status: string; service: string }

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <main className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">ASTRA</h1>
      <p className="text-sm text-neutral-400">Martian excursion planner</p>
      <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm">
        {error ? (
          <span className="text-red-400">backend: {error}</span>
        ) : health ? (
          <span className="text-emerald-400">
            backend: {health.status} ({health.service})
          </span>
        ) : (
          <span className="text-neutral-400">checking backend…</span>
        )}
      </div>
    </main>
  )
}
