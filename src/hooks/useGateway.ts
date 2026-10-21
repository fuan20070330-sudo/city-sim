import { useEffect, useMemo, useRef, useState } from 'react'
import type { SimulationState } from '../types'
import { getGatewayUrl, type GatewayMessage, type GatewayStatus } from '../lib/collaboration'

export function useOptionalGateway(state: SimulationState): GatewayStatus {
  const gatewayUrl = useMemo(() => getGatewayUrl(), [])
  const [status, setStatus] = useState<GatewayStatus>(gatewayUrl ? 'connecting' : 'disabled')
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!gatewayUrl) {
      setStatus('disabled')
      return
    }
    let disposed = false
    try {
      const socket = new WebSocket(gatewayUrl)
      socketRef.current = socket
      socket.onopen = () => {
        if (!disposed) setStatus('online')
      }
      socket.onclose = () => {
        if (!disposed) setStatus('offline')
      }
      socket.onerror = () => {
        if (!disposed) setStatus('offline')
      }
      return () => {
        disposed = true
        socket.close()
        socketRef.current = null
      }
    } catch {
      setStatus('offline')
    }
  }, [gatewayUrl])

  useEffect(() => {
    const socket = socketRef.current
    if (!gatewayUrl || !socket || socket.readyState !== WebSocket.OPEN) return
    const message: GatewayMessage = {
      type: 'simulation-snapshot',
      sentAt: new Date().toISOString(),
      snapshot: state,
    }
    socket.send(JSON.stringify(message))
  }, [gatewayUrl, state])

  return status
}
