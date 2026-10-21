export function getGatewayUrl(): string | undefined {
  const value = import.meta.env.VITE_WS_GATEWAY_URL
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export type GatewayStatus = 'disabled' | 'connecting' | 'online' | 'offline'

export interface GatewayMessage {
  type: 'simulation-snapshot'
  sentAt: string
  snapshot: unknown
}

export function gatewayStatusLabel(status: GatewayStatus): string {
  return {
    disabled: '单机模式',
    connecting: '协作连接中',
    online: '协作已连接',
    offline: '协作离线',
  }[status]
}
