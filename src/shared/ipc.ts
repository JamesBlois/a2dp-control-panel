/** IPC channel names shared by the main process and the preload bridge. */
export const IPC = {
  /** Fetch the current status + device snapshot (cheap, cached). */
  snapshot: 'a2dp:snapshot',
  /** Force a fresh read of the registry / backend. */
  refresh: 'a2dp:refresh',
  /** Write settings to Next and optionally cycle the PnP device. */
  apply: 'a2dp:apply',
  /** Relaunch the app elevated (Windows UAC) so HKLM writes are permitted. */
  elevate: 'a2dp:elevate',
  /** Re-enable a PnP device this app disabled during a failed cycle. */
  reenable: 'a2dp:reenable',
  /** Main -> renderer push of a snapshot after the watcher notices a change. */
  snapshotPush: 'a2dp:snapshot-push',
  /** Main -> renderer push of a device connect/disconnect/codec event. */
  deviceEvent: 'a2dp:device-event'
} as const
