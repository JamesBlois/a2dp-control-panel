import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { isAbsolute, join, resolve } from 'node:path'
import { IPC } from '@shared/ipc'
import type { ApplyRequest, ApplyResult, AppSnapshot, DeviceEvent, Result } from '@shared/types'
import { applySettings } from './backend/apply'
import { createProvider } from './backend/provider'
import { DeviceWatcher } from './backend/watcher'

const provider = createProvider()
const watcher = new DeviceWatcher(provider)

let mainWindow: BrowserWindow | null = null

/**
 * Relaunch this executable through UAC. The current instance then quits.
 *
 * In dev, electron-vite spawns electron.exe with the built main file as the
 * first argument (a path relative to the project root), so arguments are
 * resolved against the working directory before quoting.
 */
function relaunchElevated(): void {
  const exe = process.execPath
  const params = process.argv
    .slice(1)
    .map((a) => {
      const abs = !isAbsolute(a) ? resolve(process.cwd(), a) : a
      return /\s/.test(abs) ? `"${abs}"` : abs
    })
    .join(' ')

  // Start-Process -Verb RunAs raises the UAC prompt; -WorkingDirectory keeps
  // the relative entry path resolvable and preserves our environment.
  const ps = [
    '$ErrorActionPreference = "Stop"',
    `Start-Process -FilePath '${exe.replace(/'/g, "''")}' ` +
      `-WorkingDirectory '${process.cwd().replace(/'/g, "''")}' ` +
      `-ArgumentList '${params.replace(/'/g, "''")}' -Verb RunAs`
  ].join('; ')

  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { windowsHide: true },
    () => {
      /* UAC declined or PowerShell unavailable: stay running unelevated. */
    }
  )
  // Let the UAC prompt appear before this window closes.
  setTimeout(() => app.quit(), 800)
}

/** Windows denies HKLM writes with this wording when the process is not elevated. */
function isAccessDenied(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err)
  return /requested registry access is not allowed|access is denied|AccessDenied|UnauthorizedAccess/i.test(
    text
  )
}

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
        const raw = err instanceof Error ? err.message : String(err)
        const error = isAccessDenied(err)
          ? 'Access denied writing to HKLM. Restart the app as Administrator, then apply again.'
          : raw
        return { ok: false, error }
      }
    }
  )

  ipcMain.handle(IPC.elevate, async (): Promise<Result<void>> => {
    if (process.platform !== 'win32') {
      return { ok: false, error: 'Elevation is only available on Windows.' }
    }
    try {
      relaunchElevated()
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
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
