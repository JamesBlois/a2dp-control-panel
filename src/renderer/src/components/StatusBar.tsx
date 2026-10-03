import { CODECS, SCO_CODEC, formatBitrate, formatDelay } from '@shared/codec'
import type { DeviceView, DriverStatus } from '@shared/types'

interface Props {
  device: DeviceView | null
  status: DriverStatus | null
}

/** Coarse link-quality bucket from bitrate and delay, for the live status bar. */
function quality(device: DeviceView): { label: string; tone: 'green' | 'amber' | 'red' } {
  if (!device.connected) return { label: 'Offline', tone: 'red' }
  if (device.scoActive) return { label: 'Call active', tone: 'amber' }
  const delayMs = (device.currentDelayUnits ?? 0) / 10
  if (device.currentBitrate >= 600000 && delayMs < 200) return { label: 'Excellent', tone: 'green' }
  if (device.currentBitrate >= 250000) return { label: 'Good', tone: 'green' }
  return { label: 'Fair', tone: 'amber' }
}

export function StatusBar({ device, status }: Props) {
  const q = device ? quality(device) : null
  const codecLabel = device
    ? device.scoActive
      ? SCO_CODEC
      : device.currentCodec
        ? CODECS[device.currentCodec].label
        : '—'
    : '—'

  return (
    <footer className="statusbar">
      <span className="stat">
        <span className={`dot ${device?.connected ? 'on' : ''}`} />
        <span className="v">{device ? (device.connected ? 'Connected' : 'Disconnected') : 'No device'}</span>
      </span>
      <span className="stat">
        <span className="k">Codec</span>
        <span className="v">{codecLabel}</span>
      </span>
      <span className="stat">
        <span className="k">Bitrate</span>
        <span className="v">{formatBitrate(device?.currentBitrate)}</span>
      </span>
      <span className="stat">
        <span className="k">Latency</span>
        <span className="v">{formatDelay(device?.currentDelayUnits)}</span>
      </span>
      {q && (
        <span className="stat">
          <span className="k">Quality</span>
          <span className={`chip ${q.tone}`}>{q.label}</span>
        </span>
      )}
      {device?.scoActive && (
        <span className="stat">
          <span className="chip amber">Phone call — A2DP suspended</span>
        </span>
      )}
      <span className="spacer" />
      <span className="stat">
        <span className="pulse" />
        <span className="k">
          {status?.mock ? 'Simulated backend' : status?.isWindows ? 'Live registry' : 'Read-only'}
        </span>
      </span>
      {status && !status.isAdmin && !status.mock && (
        <span className="stat">
          <span className="chip red">Not elevated</span>
        </span>
      )}
    </footer>
  )
}
