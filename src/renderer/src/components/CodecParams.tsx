import {
  CODECS,
  formatBitrate,
  rangeMax,
  supportedOptions,
  type CodecField,
  type CodecId
} from '@shared/codec'
import type { DeviceView, RegistryValues } from '@shared/types'

interface Props {
  device: DeviceView
  codec: CodecId
  values: RegistryValues
  onChange: (key: string, value: number) => void
}

export function CodecParams({ device, codec, values, onChange }: Props) {
  const meta = CODECS[codec]
  return (
    <div className="card">
      <h3>{meta.label} Parameters</h3>
      <div className="card-sub">
        Values are written to the Next registry key and take effect on the next connection.
      </div>
      <div className="fields">
        {meta.fields.map((field) => (
          <Field
            key={field.key}
            field={field}
            capability={device.capability}
            value={values[field.key] ?? 0}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  )
}

function Field({
  field,
  capability,
  value,
  onChange
}: {
  field: CodecField
  capability: RegistryValues
  value: number
  onChange: (key: string, value: number) => void
}) {
  if (field.kind === 'select') {
    const options = supportedOptions(field, capability)
    return (
      <div className="field">
        <label>{field.label}</label>
        <select
          className="control"
          value={options.some((o) => o.value === value) ? value : (options[0]?.value ?? 0)}
          onChange={(e) => onChange(field.key, Number(e.target.value))}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.help && <span className="help">{field.help}</span>}
      </div>
    )
  }

  if (field.kind === 'toggle') {
    return (
      <div className="field">
        <label>{field.label}</label>
        <label className="switch">
          <input
            type="checkbox"
            checked={value === 1}
            onChange={(e) => onChange(field.key, e.target.checked ? 1 : 0)}
          />
          <span className="track" />
          <span>{value === 1 ? 'Enabled' : 'Disabled'}</span>
        </label>
        {field.help && <span className="help">{field.help}</span>}
      </div>
    )
  }

  // range
  const min = field.min ?? 0
  const max = rangeMax(field, capability)
  const step = field.step ?? 1
  const isAuto = field.autoValue !== undefined && value === field.autoValue
  const display =
    field.unit === 'bps' ? formatBitrate(isAuto ? 0 : value) : `${value}${field.unit ?? ''}`

  return (
    <div className="field">
      <label>
        <span>{field.label}</span>
        <span className="value">{isAuto ? 'Auto' : display}</span>
      </label>
      <div className="range-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={isAuto ? max : Math.min(max, Math.max(min, value))}
          disabled={isAuto}
          onChange={(e) => onChange(field.key, Number(e.target.value))}
        />
        {field.autoValue !== undefined && (
          <label className="switch auto-toggle" title="Use the device default">
            <input
              type="checkbox"
              checked={isAuto}
              onChange={(e) => onChange(field.key, e.target.checked ? (field.autoValue as number) : max)}
            />
            <span className="track" />
            <span className="help">Auto</span>
          </label>
        )}
      </div>
      {field.help && <span className="help">{field.help}</span>}
    </div>
  )
}
