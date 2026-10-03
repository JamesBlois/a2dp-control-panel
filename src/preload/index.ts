import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { A2dpApi, AppSnapshot, DeviceEvent } from '@shared/types'

const api: A2dpApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.snapshot),
  refresh: () => ipcRenderer.invoke(IPC.refresh),
  apply: (request) => ipcRenderer.invoke(IPC.apply, request),
  elevate: () => ipcRenderer.invoke(IPC.elevate),
  onSnapshot: (cb) => {
    const listener = (_e: unknown, snapshot: AppSnapshot): void => cb(snapshot)
    ipcRenderer.on(IPC.snapshotPush, listener)
    return () => ipcRenderer.removeListener(IPC.snapshotPush, listener)
  },
  onDeviceEvent: (cb) => {
    const listener = (_e: unknown, event: DeviceEvent): void => cb(event)
    ipcRenderer.on(IPC.deviceEvent, listener)
    return () => ipcRenderer.removeListener(IPC.deviceEvent, listener)
  }
}

contextBridge.exposeInMainWorld('a2dp', api)
