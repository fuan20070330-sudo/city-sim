import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

export interface ToastMessage {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

interface ToastProps {
  toast: ToastMessage | null
  onClose: () => void
}

export function Toast({ toast, onClose }: ToastProps) {
  if (!toast) return null
  const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? AlertTriangle : Info
  return (
    <div className={'toast ' + toast.tone} role="status" data-testid="toast">
      <span className="toast-icon"><Icon size={17} /></span>
      <span>{toast.text}</span>
      <button type="button" onClick={onClose} aria-label="关闭提示"><X size={14} /></button>
    </div>
  )
}
