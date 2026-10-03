import { EventEmitter } from 'node:events'
import { deriveDevices } from './view'
import type { DriverProvider } from '../providers/types'
import type { AppSnapshot, DeviceEvent, DeviceView, DriverStatus } from '@shared/types'

const DEFAULT_INTERVAL_MS = 2000
const MAX_INTERVAL_MS = 10_000

/**
 * Polls the provider for device state, derives the UI view, and emits:
 *  - 'snapshot'  with a full AppSnapshot whenever anything changed (or on demand)
 *  - 'event'     with a DeviceEvent for connect/disconnect/codec transitions
 *
 * The backend is a registry read through PowerShell, so a poll is not free; the
 * interval backs off while nothing is changing to keep the process idle-cheap.
 */
export class DeviceWatcher extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private intervalMs = DEFAULT_INTERVAL_MS
  private devices: DeviceView[] = []
  private status: DriverStatus | null = null
  private previous = new Map<string, DeviceView>()
  private busy = false
  private primed = false

  constructor(private readonly provider: DriverProvider) {
    super()
  }

  start(): void {
    if (this.timer) return
    void this.tick()
    this.schedule()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  snapshot(): AppSnapshot {
    return {
      status:
        this.status ??
        ({
          isWindows: false,
          isAdmin: false,
          driverInstalled: false,
          serviceInstalled: false,
          serviceRunning: false,
          mock: this.provider.kind === 'mock',
          message: null
        } satisfies DriverStatus),
      devices: this.devices,
      timestamp: Date.now()
    }
  }

  /** Force an immediate poll (e.g. after Apply or a manual refresh). */
  async refreshNow(): Promise<AppSnapshot> {
    await this.tick(true)
    return this.snapshot()
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      void this.tick().finally(() => this.schedule())
    }, this.intervalMs)
  }

  private async tick(force = false): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      if (!this.status || force) this.status = await this.provider.status()
      const states = await this.provider.readDevices()
      const devices = deriveDevices(states)
      const changed = force || JSON.stringify(devices) !== JSON.stringify(this.devices)

      if (this.primed) this.diff(devices)
      this.devices = devices
      this.previous = new Map(devices.map((d) => [d.address, d]))
      this.primed = true

      // Poll quickly while the view is changing, then back off toward MAX when idle.
      this.intervalMs = changed
        ? DEFAULT_INTERVAL_MS
        : Math.min(MAX_INTERVAL_MS, this.intervalMs + DEFAULT_INTERVAL_MS)

      if (changed || force) this.emit('snapshot', this.snapshot())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.status = { ...(this.status ?? defaultStatus(this.provider)), message }
      this.emit('event', {
        kind: 'error',
        address: '',
        name: 'Backend',
        detail: message
      } satisfies DeviceEvent)
      this.intervalMs = MAX_INTERVAL_MS
    } finally {
      this.busy = false
    }
  }

  private diff(devices: DeviceView[]): void {
    for (const d of devices) {
      const prev = this.previous.get(d.address)
      if (!prev) {
        this.emit('event', {
          kind: d.connected ? 'connected' : 'disconnected',
          address: d.address,
          name: d.name
        } satisfies DeviceEvent)
        continue
      }
      if (prev.connected !== d.connected) {
        this.emit('event', {
          kind: d.connected ? 'connected' : 'disconnected',
          address: d.address,
          name: d.name
        } satisfies DeviceEvent)
      } else if (prev.currentCodec !== d.currentCodec && d.currentCodec) {
        this.emit('event', {
          kind: 'codec-changed',
          address: d.address,
          name: d.name,
          detail: d.currentCodec
        } satisfies DeviceEvent)
      }
    }
  }
}

function defaultStatus(provider: DriverProvider): DriverStatus {
  return {
    isWindows: process.platform === 'win32',
    isAdmin: false,
    driverInstalled: false,
    serviceInstalled: false,
    serviceRunning: false,
    mock: provider.kind === 'mock',
    message: null
  }
}
