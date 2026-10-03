import type { CodecId } from './codec'

/** A single registry snapshot of a device (one of Capability / Current / Next). */
export type RegistryValues = Record<string, number>

export interface DeviceState {
  address: string
  /** Friendly name from the Capability subkey's `Name` value, if present. */
  name: string
  /** PnP instance ID used for disable/enable cycling, when resolvable. */
  instanceId: string | null
  capability: RegistryValues
  current: RegistryValues | null
  next: RegistryValues | null
}

/** Derived, UI-friendly view of a device. */
export interface DeviceView {
  address: string
  name: string
  instanceId: string | null
  connected: boolean
  scoActive: boolean
  /** Full Capability value map, used to filter options and clamp ranges. */
  capability: RegistryValues
  /** Raw Next values (writable target), used to seed the settings editor. */
  nextValues: RegistryValues
  /** Raw Current values, used as a fallback when seeding the editor. */
  currentValues: RegistryValues | null
  supports: CodecId[]
  /** Codec negotiated right now (from Current). */
  currentCodec: CodecId | null
  /** Codec requested for the next connection (from Next). */
  nextCodec: CodecId | null
  currentBitrate: number
  currentDelayUnits: number | null
  error: number
  /** True when Next differs from the applied/negotiated configuration. */
  pendingChanges: boolean
}

export interface DriverStatus {
  /** Running on Windows (registry + PnP backend is meaningful). */
  isWindows: boolean
  /** Process has Administrator rights. */
  isAdmin: boolean
  /** HKLM AltA2DP service key exists (driver installed). */
  driverInstalled: boolean
  /** `...\Parameters\Devices` exists (driver has been configured at least once). */
  devicesKeyPresent: boolean
  /** Which of Capability/Current/Next subkeys currently exist. */
  keysFound: string[]
  /** AltA2dpSVC service is present/running. */
  serviceInstalled: boolean
  serviceRunning: boolean
  /** Using the simulated backend instead of the real registry. */
  mock: boolean
  /** Human-readable detail for the banner (e.g. last backend error). */
  message: string | null
  /** Raw stdout/stderr from the last backend invocation, for troubleshooting. */
  debug?: string | null
}

export interface AppSnapshot {
  status: DriverStatus
  devices: DeviceView[]
  timestamp: number
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/** Toast payload emitted by the main process on device connect/disconnect. */
export interface DeviceEvent {
  kind: 'connected' | 'disconnected' | 'codec-changed' | 'error'
  address: string
  name: string
  detail?: string
}

/** Settings written by the UI when applying a codec configuration. */
export interface ApplyRequest {
  address: string
  codec: CodecId
  /** Registry value name -> DWORD. */
  values: Record<string, number>
  /** Cycle the PnP device to force the driver to reconnect. */
  reconnect: boolean
}

export interface ApplyResult {
  written: string[]
  reconnected: boolean
  warnings: string[]
}

/** The API exposed to the renderer as `window.a2dp` (via the preload bridge). */
export interface A2dpApi {
  getSnapshot(): Promise<AppSnapshot>
  refresh(): Promise<AppSnapshot>
  apply(request: ApplyRequest): Promise<Result<ApplyResult>>
  /** Relaunch the app with Administrator rights (Windows UAC prompt). */
  elevate(): Promise<Result<void>>
  onSnapshot(cb: (snapshot: AppSnapshot) => void): () => void
  onDeviceEvent(cb: (event: DeviceEvent) => void): () => void
}
