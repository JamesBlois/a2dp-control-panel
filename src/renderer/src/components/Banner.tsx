import { AlertTriangle, Info, ShieldAlert } from 'lucide-react'
import type { DriverStatus } from '@shared/types'

/** Top-of-window banner explaining backend / elevation / driver state. */
export function Banner({ status, onRefresh }: { status: DriverStatus | null; onRefresh: () => void }) {
  if (!status) return null

  if (status.mock) {
    return (
      <div className="banner warn">
        <Info size={15} />
        <span>{status.message ?? 'Simulated backend active.'}</span>
      </div>
    )
  }

  if (!status.driverInstalled) {
    return (
      <div className="banner error">
        <ShieldAlert size={15} />
        <span>
          The AltA2DP driver was not found in the registry. Install it first — this app only
          configures an existing installation.
        </span>
      </div>
    )
  }

  if (!status.isAdmin) {
    return (
      <div className="banner warn">
        <ShieldAlert size={15} />
        <span>
          Not running as Administrator. Reading works, but applying settings and reconnecting devices
          will fail. Close the app and reopen it with “Run as administrator”.
        </span>
        <span className="banner-actions">
          <button className="btn sm" onClick={onRefresh}>
            Retry
          </button>
        </span>
      </div>
    )
  }

  if (status.serviceInstalled && !status.serviceRunning) {
    return (
      <div className="banner warn">
        <AlertTriangle size={15} />
        <span>AltA2dpSVC is installed but not running. Reconnect may not take effect until it starts.</span>
      </div>
    )
  }

  return null
}
