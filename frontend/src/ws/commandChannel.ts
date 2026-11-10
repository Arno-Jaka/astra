type Payload = Record<string, unknown>

export type CommandMessage = {
  type: 'command'
  id: string
  name: string
  payload: Payload
}

export type AckMessage = {
  type: 'ack'
  id: string
  status: 'ok' | 'error'
  ts: number
  detail?: string
}

export type CommandHandler = (payload: Payload) => void | Promise<void>

const handlers = new Map<string, CommandHandler>()

let socket: WebSocket | null = null

export function onCommand(name: string, handler: CommandHandler): () => void {
  handlers.set(name, handler)
  return () => {
    if (handlers.get(name) === handler) handlers.delete(name)
  }
}

export function connectCommands(retryMs = 1500): () => void {
  let disposed = false
  let retry: number | undefined
  let current: WebSocket | null = null

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    current = ws
    socket = ws

    ws.onmessage = async (event) => {
      let message: CommandMessage
      try {
        message = JSON.parse(String(event.data)) as CommandMessage
      } catch {
        return
      }
      if (message.type !== 'command') return

      const ack: AckMessage = { type: 'ack', id: message.id, status: 'ok', ts: Date.now() }
      const handler = handlers.get(message.name)
      if (!handler) {
        ack.status = 'error'
        ack.detail = `no handler for ${message.name}`
      } else {
        try {
          await handler(message.payload)
        } catch (error) {
          ack.status = 'error'
          ack.detail = error instanceof Error ? error.message : String(error)
        }
      }
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ack))
    }

    ws.onclose = () => {
      if (socket === ws) socket = null
      if (!disposed) retry = window.setTimeout(open, retryMs)
    }
  }

  open()

  return () => {
    disposed = true
    window.clearTimeout(retry)
    current?.close()
    if (socket === current) socket = null
  }
}
