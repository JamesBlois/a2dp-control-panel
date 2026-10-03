import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { Toast } from '../hooks/useA2dp'

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warn: AlertTriangle,
  error: XCircle
} as const

export function Toasts({
  toasts,
  onDismiss
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="toasts">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div key={t.id} className={`toast ${t.kind}`} role="status">
            <Icon className="t-icon" size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-title">{t.title}</div>
              {t.detail && <div className="t-detail">{t.detail}</div>}
            </div>
            <button className="btn ghost sm" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
