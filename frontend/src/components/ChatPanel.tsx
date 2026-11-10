import { useEffect, useRef, useState } from 'react'

export type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
}

type Props = {
  messages: ChatMessage[]
  busy: boolean
  error: string | null
  voice: boolean
  onSend: (text: string) => void
  onDismissError: () => void
  onToggleVoice: () => void
}

const EXAMPLES = [
  'Take me to Gale Crater and tell me the weather',
  'What is the weather at Jezero Crater?',
  'Plan a 10 degree route from Gale Crater to Mount Sharp',
]

type RecognitionEvent = {
  results: { 0: { 0: { transcript: string } } }
}

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type RecognitionConstructor = new () => Recognition

function speechConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={index} className="font-semibold text-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}

function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split('\n').map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-1" />
        const bullet = line.startsWith('- ') || line.startsWith('* ')
        return (
          <div key={index} className={bullet ? 'flex gap-2' : undefined}>
            {bullet ? <span className="mt-0.5 text-orange-400">•</span> : null}
            <span>{inline(bullet ? line.slice(2) : line)}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function ChatPanel({
  messages,
  busy,
  error,
  voice,
  onSend,
  onDismissError,
  onToggleVoice,
}: Props) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const speechSupported = speechConstructor() !== null

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, busy])

  useEffect(
    () => () => {
      recognitionRef.current?.stop()
    },
    [],
  )

  const toggleMicrophone = () => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const Constructor = speechConstructor()
    if (!Constructor) return
    const recognition = new Constructor()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      if (transcript) setText(transcript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const submit = () => {
    const value = text.trim()
    if (!value || busy) return
    onSend(value)
    setText('')
  }

  return (
    <section className="flex h-[340px] flex-col overflow-hidden rounded-xl border border-white/10 bg-black/65 shadow-2xl backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-orange-300/80">
            Mission console
          </p>
          <h1 className="text-sm font-semibold text-white">ASTRA</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleVoice}
            className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider transition ${
              voice
                ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
                : 'border-white/10 bg-white/[0.04] text-neutral-500'
            }`}
            aria-pressed={voice}
          >
            Voice {voice ? 'on' : 'off'}
          </button>
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider ${
              busy
                ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                busy ? 'animate-pulse bg-amber-300' : 'bg-emerald-300'
              }`}
            />
            {busy ? 'Working' : 'Online'}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-lg px-3 py-2 leading-relaxed ${
                message.role === 'user'
                  ? 'bg-orange-400/20 text-orange-50'
                  : 'bg-white/[0.06] text-neutral-200'
              }`}
            >
              <RichText text={message.content} />
            </div>
          </div>
        ))}
        {busy ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-neutral-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-300" />
              Planning on Mars time…
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {error ? (
        <div className="flex items-start justify-between gap-2 border-t border-red-400/20 bg-red-400/10 px-4 py-2 text-xs text-red-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="text-red-300 hover:text-white"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="border-t border-white/10 px-4 py-3">
        {messages.length <= 2 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onSend(example)}
                disabled={busy}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-neutral-300 transition hover:border-orange-300/40 hover:text-orange-200 disabled:opacity-40"
              >
                {example}
              </button>
            ))}
          </div>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            rows={2}
            placeholder="Fly, check weather, or plan a traverse…"
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-orange-300/50 focus:outline-none"
          />
          {speechSupported ? (
            <button
              type="button"
              onClick={toggleMicrophone}
              disabled={busy}
              aria-label={
                listening ? 'Stop voice input' : 'Start voice input'
              }
              className={`h-[44px] rounded-lg border px-3 text-xs font-semibold transition ${
                listening
                  ? 'border-sky-300/50 bg-sky-400/20 text-sky-200'
                  : 'border-white/10 bg-white/[0.04] text-neutral-400 hover:text-sky-200'
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {listening ? 'Stop' : 'Mic'}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="h-[44px] rounded-lg bg-orange-400 px-3 text-xs font-semibold text-black transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-500"
          >
            Send
          </button>
        </form>
      </div>
    </section>
  )
}
