import { CODECS, CODEC_ORDER, type CodecId } from '@shared/codec'
import type { DeviceView } from '@shared/types'

interface Props {
  device: DeviceView
  selected: CodecId
  onSelect: (codec: CodecId) => void
}

export function CodecSelector({ device, selected, onSelect }: Props) {
  return (
    <div className="card">
      <h3>Codec</h3>
      <div className="card-sub">
        {device.supports.length} codec{device.supports.length === 1 ? '' : 's'} advertised by this
        device. Greyed-out tiles are not supported.
      </div>
      <div className="codec-grid">
        {CODEC_ORDER.map((id) => {
          const meta = CODECS[id]
          const supported = device.supports.includes(id)
          const active = selected === id
          const live = device.currentCodec === id && device.connected
          return (
            <button
              key={id}
              className={`codec-tile${active ? ' active' : ''}`}
              disabled={!supported}
              onClick={() => onSelect(id)}
              title={supported ? meta.blurb : `${meta.label} not supported by this device`}
            >
              <span className="ct-name">
                {meta.label}
                {active && <span className="ct-badge">Selected</span>}
                {live && !active && <span className="ct-live">Live</span>}
              </span>
              <span className="ct-blurb">{supported ? meta.blurb : 'Not supported'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
