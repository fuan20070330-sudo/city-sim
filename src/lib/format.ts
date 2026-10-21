export function formatSimClock(startTime: string, elapsedMinutes: number): string {
  const [hourText, minuteText] = startTime.split(':')
  const baseHour = Number(hourText) || 0
  const baseMinute = Number(minuteText) || 0
  const total = (baseHour * 60 + baseMinute + Math.round(elapsedMinutes)) % (24 * 60)
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function formatElapsed(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  return `T+${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

export function formatNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

export function compactTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
