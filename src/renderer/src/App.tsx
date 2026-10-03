import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bluetooth, RefreshCw, RotateCcw, Save, Zap, AlertTriangle } from 'lucide-react'
import { CODECS, formatAddress, type CodecId } from '@shared/codec'
import type { ApplyRequest, DeviceView } from '@shared/types'
import { useA2dp } from './hooks/useA2dp'
import { activeCodec, isDirty, normalizeValues, seedValues } from './lib/editor'
import { Banner } from './components/Banner'
import { CodecParams } from './components/CodecParams'
import { CodecSelector } from './components/CodecSelector'
import { DeviceList } from './components/DeviceList'
import { StatusBar } from './components/StatusBar'
import { Toasts } from './components/Toasts'

export default function App() {
  const { snapshot, busy, toasts, dismissToast, refresh, apply, elevate, reenable } = useA2dp()
  const devices = snapshot?.devices ?? []
  const status = snapshot?.status ?? null

  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [reconnect, setReconnect] = useState(true)

  const device = useMemo(
    () => devices.find((d) => d.address === selectedAddress) ?? null,
    [devices, selectedAddress]
  )

  // Keep a device selected as the list changes (e.g. after a reconnect).
  useEffect(() => {
    if (devices.length === 0) {
      if (selectedAddress !== null) setSelectedAddress(null)
      return
    }
    if (!selectedAddress || !devices.some((d) => d.address === selectedAddress)) {
      const preferred = devices.find((d) => d.connected) ?? devices[0]
      setSelectedAddress(preferred.address)
    }
  }, [devices, selectedAddress])

  return (
    <div className="app">
      <header className="titlebar">
        <span className="brand">
          <span className="logo">
            <Bluetooth size={15} />
          </span>
          A2DP Control Panel
        </span>
        <span className="spacer" />
        <span className="tb-actions">
          {status && (
            <span className={`chip ${status.mock ? 'amber' : status.isAdmin ? 'green' : 'red'}`}>
              {status.mock ? 'Simulated' : status.isAdmin ? 'Administrator' : 'Standard user'}
            </span>
          )}
          <button className="btn sm" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw size={14} className={busy ? 'spin' : ''} />
            Refresh
          </button>
        </span>
      </header>

      <Banner status={status} onRefresh={() => void refresh()} onElevate={() => void elevate()} />

      <div className="body">
        <DeviceList devices={devices} selected={selectedAddress} onSelect={setSelectedAddress} />
        <main className="main">
          {device ? (
            <DevicePanel
              key={device.address}
              device={device}
              busy={busy}
              reconnect={reconnect}
              onReconnectChange={setReconnect}
              onApply={apply}
              onRefresh={refresh}
              onReenable={reenable}
            />
          ) : (
            <div className="main-empty">
              <div>
                <Bluetooth size={40} style={{ opacity: 0.3 }} />
                <p>
                  Select a device to configure its Bluetooth audio codec.
                  <br />
                  Devices appear here once the AltA2DP driver has seen them.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      <StatusBar device={device} status={status} />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

interface PanelProps {
  device: DeviceView
  busy: boolean
  reconnect: boolean
  onReconnectChange: (v: boolean) => void
  onApply: (req: ApplyRequest) => Promise<unknown>
  onRefresh: () => Promise<void>
  onReenable: (address: string) => Promise<unknown>
}

function DevicePanel({
  device,
  busy,
  reconnect,
  onReconnectChange,
  onApply,
  onRefresh,
  onReenable
}: PanelProps) {
  const initialCodec = activeCodec(device) ?? device.supports[0] ?? 'SBC'
  const [codec, setCodec] = useState<CodecId>(initialCodec)
  const [values, setValues] = useState(() => seedValues(device, initialCodec))
  const seedKey = useRef(`${device.address}:${device.nextCodec ?? ''}`)

  // Re-seed the editor only when the device changes or the driver's queued codec
  // changes underneath us — never on every poll, which would clobber edits.
  useEffect(() => {
    const key = `${device.address}:${device.nextCodec ?? ''}`
    if (key !== seedKey.current) {
      seedKey.current = key
      const next = activeCodec(device) ?? device.supports[0] ?? 'SBC'
      setCodec(next)
      setValues(seedValues(device, next))
    }
  }, [device])

  const onSelectCodec = useCallback(
    (id: CodecId) => {
      setCodec(id)
      setValues(seedValues(device, id))
    },
    [device]
  )

  const onChange = useCallback((key: string, value: number) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  const dirty = isDirty(device, codec, values)
  const normalized = normalizeValues(codec, values, device.capability)

  const doApply = async () => {
    await onApply({ address: device.address, codec, values: normalized, reconnect })
    await onRefresh()
  }

  const doReset = () => {
    setValues(seedValues(device, codec))
  }

  return (
    <>
      <div className="panel-head">
        <div>
          <h1>{device.name}</h1>
          <div className="addr">{formatAddress(device.address)}</div>
          <div className="head-chips">
            <span className={`chip ${device.connected ? 'green' : ''}`}>
              {device.connected ? 'Connected' : 'Disconnected'}
            </span>
            {device.currentCodec && (
              <span className="chip accent">Live: {CODECS[device.currentCodec].label}</span>
            )}
            {device.scoActive && <span className="chip amber">Phone call active</span>}
            {device.disabled && <span className="chip red">Disabled</span>}
            {device.pendingChanges && <span className="chip amber">Pending reconnect</span>}
            {device.error > 0 && <span className="chip red">Error {device.error}</span>}
          </div>
        </div>
      </div>

      {device.disabled && (
        <div className="banner warn">
          <AlertTriangle size={15} />
          <span>
            This device is currently <strong>disabled</strong> in Windows. Settings are saved, but
            audio will not play until it is re-enabled.
          </span>
          <span className="banner-actions">
            <button
              className="btn sm primary"
              disabled={busy}
              onClick={() => void onReenable(device.address)}
            >
              Re-enable device
            </button>
          </span>
        </div>
      )}

      <CodecSelector device={device} selected={codec} onSelect={onSelectCodec} />
      <CodecParams device={device} codec={codec} values={values} onChange={onChange} />

      <div className="apply-bar">
        <label className="switch">
          <input
            type="checkbox"
            checked={reconnect}
            onChange={(e) => onReconnectChange(e.target.checked)}
          />
          <span className="track" />
          <span>Reconnect after applying</span>
        </label>
        <span className={`hint${dirty ? ' dirty' : ''}`}>
          {dirty ? (
            <>
              <Zap size={14} /> Unsaved changes
            </>
          ) : (
            'Settings match the queued configuration'
          )}
        </span>
        <span className="grow" />
        <button className="btn" onClick={doReset} disabled={busy || !dirty}>
          <RotateCcw size={14} />
          Reset
        </button>
        <button className="btn primary" onClick={() => void doApply()} disabled={busy || !dirty}>
          <Save size={14} />
          {busy ? 'Applying…' : 'Apply'}
        </button>
      </div>
    </>
  )
}
