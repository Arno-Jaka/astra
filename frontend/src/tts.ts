let audio: HTMLAudioElement | null = null
let objectUrl: string | null = null

function release() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
  audio = null
}

export function stopSpeaking() {
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  release()
}

export async function speak(text: string) {
  const cleaned = text.replace(/\*\*/g, '').replace(/`/g, '').trim()
  if (!cleaned) return

  stopSpeaking()
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleaned }),
    })
    if (!response.ok) return

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const player = new Audio(url)
    audio = player
    objectUrl = url
    player.addEventListener(
      'ended',
      () => {
        if (audio === player) release()
      },
      { once: true },
    )
    await player.play()
  } catch {
    release()
  }
}
