import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import type { ApplyRequest, ApplyResult, AppSnapshot, DeviceEvent, Result } from '@shared/types'
import { applySettings } from './backend/apply'
import { createProvider } from './backend/provider'
import { DeviceWatcher } from './backend/watcher'

const provider = createProvider()
const watcher = new DeviceWatcher(provider)

let mainWindow: BrowserWindow | null = null

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1117',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f1117',
      symbolColor: '#c7cbd6',
      height: 48
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.snapshot, async (): Promise<AppSnapshot> => watcher.snapshot())

  ipcMain.handle(IPC.refresh, async (): Promise<AppSnapshot> => watcher.refreshNow())

  ipcMain.handle(
    IPC.apply,
    async (_event, request: ApplyRequest): Promise<Result<ApplyResult>> => {
      try {
        const device = watcher.snapshot().devices.find((d) => d.address === request.address)
        if (!device) return { ok: false, error: `Unknown device ${request.address}` }
        const result = await applySettings(provider, device, request)
        await watcher.refreshNow()
        return { ok: true, data: result }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        return { ok: false, error }
      }
    }
  )
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  watcher.on('snapshot', (snapshot: AppSnapshot) => send(IPC.snapshotPush, snapshot))
  watcher.on('event', (event: DeviceEvent) => send(IPC.deviceEvent, event))
  watcher.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  watcher.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => watcher.stop())
