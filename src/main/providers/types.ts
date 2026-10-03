import type { DeviceState, DriverStatus } from '@shared/types'

/**
 * Backend abstraction over the AltA2DP driver. Two implementations exist:
 *  - PowerShellProvider: reads/writes the real registry and cycles PnP devices.
 *  - MockProvider: deterministic simulated devices for development and QA on
 *    non-Windows machines (and for visual testing of the UI).
 */
export interface DriverProvider {
  readonly kind: 'powershell' | 'mock'
  /** Whether this provider can mutate real driver state. */
  readonly writable: boolean

  status(): Promise<DriverStatus>

  /** Read Capability/Current/Next for every device the driver knows about. */
  readDevices(): Promise<DeviceState[]>

  /**
   * Write a validated set of DWORD values into the Next subkey for a device.
   * Returns the list of value names actually written.
   */
  writeNext(address: string, values: Record<string, number>): Promise<string[]>

  /** Disable then re-enable a PnP device to force the driver to reconnect. */
  reconnect(instanceId: string): Promise<void>

  /** Re-enable a device this app disabled, using the most reliable mechanism. */
  enableDevice(instanceId: string): Promise<void>
}
