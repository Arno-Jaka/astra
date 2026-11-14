import { useEffect, useRef, useState } from 'react'
import ChatPanel, { type ChatMessage } from './components/ChatPanel'
import ConditionsCard from './components/ConditionsCard'
import EnvironmentPanel from './components/EnvironmentPanel'
import RoutePanel from './components/RoutePanel'
import SurvivalBriefingPanel from './components/SurvivalBriefingPanel'
import CesiumMap from './map/CesiumMap'
import FloatingPanel from './components/FloatingPanel'
import { useAppStore } from './store/appStore'
import { speak, stopSpeaking } from './tts'
import { connectCommands } from './ws/commandChannel'

type Health = { status: string; service: string }

const WELCOME: ChatMessage = {
  id: 0,
  role: 'assistant',
  content:
    'ASTRA online. Select a departure point and a destination on the map; ASTRA predicts the safest and hazardous traverses and assigns a vehicle. A crew-safe destination sends the Space Exploration Vehicle all the way, with three astronauts walking or hopping the final approach; a hazardous destination parks the SEV nearby and auto-deploys a rover. The weather & radiation panel screens regions as safe, caution or unsafe. Adjust mission parameters in the traverse plan. I can also fly to sites, retrieve Gale REMS reports and explain MOLA route hazards.',
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
      <FloatingPanel id="status" title="Mission status" width={370} initial={{ left: 16, top: 16 }} fixed>
        <header className="flex items-center gap-3 px-4 py-2">
          <span className="text-lg font-semibold tracking-tight text-white">
            ASTRA
          </span>
          <span className="hidden text-[11px] text-neutral-400 sm:block">
            V1.0.0
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
      </FloatingPanel>

      <main>
        <FloatingPanel id="environment" title="Weather & radiation" width={340} initial={{ left: 16, top: 72 }}>
          <div className="max-h-[32vh] overflow-auto">
            <EnvironmentPanel />
          </div>
        </FloatingPanel>
        <FloatingPanel id="console" title="Mission console" width={420} initial={{ left: 16, bottom: 16 }}>
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
        </FloatingPanel>
        {briefing ? <FloatingPanel id="briefing" title="Science briefing" width={420} initial={{ right: 16, bottom: 16 }}><SurvivalBriefingPanel briefing={briefing} /></FloatingPanel> : null}
        {conditions ? <FloatingPanel id="conditions" title="NASA conditions" width={380} initial={{ right: 16, bottom: 16 }}><ConditionsCard conditions={conditions} /></FloatingPanel> : null}
        {route ? <FloatingPanel id="route" title="Traverse plan" width={420} initial={{ right: 16, top: 360 }}><div className="max-h-[62vh] overflow-auto"><RoutePanel route={route} /></div></FloatingPanel> : null}
      </main>
    </div>
  )
}
