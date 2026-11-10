import { useEffect, useRef, useState } from 'react'
import ChatPanel, { type ChatMessage } from './components/ChatPanel'
import ConditionsCard from './components/ConditionsCard'
import RoutePanel from './components/RoutePanel'
import SurvivalBriefingPanel from './components/SurvivalBriefingPanel'
import CesiumMap from './map/CesiumMap'
import { useAppStore } from './store/appStore'
import { speak, stopSpeaking } from './tts'
import { connectCommands } from './ws/commandChannel'

type Health = { status: string; service: string }

const WELCOME: ChatMessage = {
  id: 0,
  role: 'assistant',
  content:
    'ASTRA online. I can fly the map, pull live REMS weather from Gale, and plan slope-limited traverses on MOLA terrain. Try "Take me to Gale Crater."',
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [voice, setVoice] = useState(true)
  const nextId = useRef(1)
  const briefing = useAppStore((state) => state.briefing)
  const conditions = useAppStore((state) => state.conditions)
  const route = useAppStore((state) => state.route)

  useEffect(() => connectCommands(), [])

  useEffect(() => {
    fetch('/api/health')
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error(String(response.status))),
      )
      .then(setHealth)
      .catch((cause: unknown) =>
        setHealthError(cause instanceof Error ? cause.message : String(cause)),
      )
  }, [])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || busy) return

    setError(null)
    setBusy(true)
    const userId = nextId.current++
    setMessages((previous) => [
      ...previous,
      { id: userId, role: 'user', content: message },
    ])

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!response.ok) throw new Error(`agent ${response.status}`)
      const data = (await response.json()) as { content?: string }
      const content = data.content?.trim() || 'Done.'
      const assistantId = nextId.current++
      setMessages((previous) => [
        ...previous,
        { id: assistantId, role: 'assistant', content },
      ])
      if (voice) void speak(content)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      setError(`Could not reach the mission backend (${detail}).`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <CesiumMap />
      <header className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-3 rounded-lg border border-white/10 bg-black/55 px-4 py-2 shadow-xl backdrop-blur-md">
        <span className="text-lg font-semibold tracking-tight text-white">
          ASTRA
        </span>
        <span className="hidden text-[11px] text-neutral-400 sm:block">
          Mars excursion planner
        </span>
        <span className="h-4 w-px bg-white/15" />
        {healthError ? (
          <span className="text-xs text-red-400">backend: {healthError}</span>
        ) : health ? (
          <span className="text-xs text-emerald-400">
            backend: {health.status}
          </span>
        ) : (
          <span className="text-xs text-neutral-400">checking backend…</span>
        )}
      </header>

      <main className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end gap-3 p-4 pt-20 md:flex-row md:items-end">
        <div className="pointer-events-auto w-full md:w-[420px]">
          <ChatPanel
            messages={messages}
            busy={busy}
            error={error}
            voice={voice}
            onSend={send}
            onDismissError={() => setError(null)}
            onToggleVoice={() => {
              if (voice) stopSpeaking()
              setVoice(!voice)
            }}
          />
        </div>
        <aside className="pointer-events-auto flex max-h-[68vh] w-full flex-col gap-3 overflow-y-auto md:ml-auto md:w-[380px]">
          {briefing ? <SurvivalBriefingPanel briefing={briefing} /> : null}
          {conditions ? <ConditionsCard conditions={conditions} /> : null}
          {route ? <RoutePanel route={route} /> : null}
        </aside>
      </main>
    </div>
  )
}
