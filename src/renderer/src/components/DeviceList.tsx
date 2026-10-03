import { CODECS, formatAddress } from '@shared/codec'
import type { DeviceView } from '@shared/types'

interface Props {
  devices: DeviceView[]
  selected: string | null
  onSelect: (address: string) => void
}

export function DeviceList({ devices, selected, onSelect }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h2>Devices</h2>
        <span className="chip">{devices.length}</span>
      </div>
      <div className="device-list">
        {devices.length === 0 && (
          <div className="sidebar-empty">
            No devices yet. Pair a Bluetooth headset while the driver is installed — it will appear
            here automatically.
          </div>
        )}
        {devices.map((d) => {
          const codec = d.currentCodec ?? d.nextCodec
          return (
            <button
              key={d.address}
              className={`device-item${selected === d.address ? ' selected' : ''}`}
              onClick={() => onSelect(d.address)}
              title={formatAddress(d.address)}
            >
              <span className={`dot${d.connected ? ' on' : ''}`} />
              <span className="meta">
                <span className="name">{d.name}</span>
                <span className="sub">
                  {d.connected ? 'Connected' : 'Disconnected'}
                  {codec && <span className="chip accent">{CODECS[codec].label}</span>}
                  {d.scoActive && <span className="chip amber">Call</span>}
                  {d.pendingChanges && <span className="chip">Pending</span>}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
