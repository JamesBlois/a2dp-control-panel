import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  BTHENUM_A2DP_PATTERN,
  CAPABILITY_KEY,
  CURRENT_KEY,
  NEXT_KEY,
  READ_VALUES,
  SERVICE_KEY,
  WRITABLE_VALUES
} from '@shared/registry'
import type { DeviceState, DriverStatus, RegistryValues } from '@shared/types'
import type { DriverProvider } from './types'

const execFileAsync = promisify(execFile)

const PS_EXE = process.env.A2DP_PS_EXE || 'powershell.exe'

/**
 * Enumerates every device subkey and projects it to JSON. Runs as one script so
 * a poll costs a single process spawn. `Name` is a REG_SZ value on the
 * Capability subkey; everything else is a DWORD.
 */
const READ_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$capBase = '${CAPABILITY_KEY}'
$valueNames = @(${READ_VALUES.map((v) => `'${v}'`).join(', ')})

function Read-Values([string]$path) {
    if (-not (Test-Path $path)) { return $null }
    $props = Get-ItemProperty -Path $path -ErrorAction SilentlyContinue
    if ($null -eq $props) { return $null }
    $out = [ordered]@{}
    foreach ($n in $valueNames) {
        if ($props.PSObject.Properties.Name -contains $n) {
            $v = $props.$n
            if ($null -ne $v) { $out[$n] = [int64]$v }
        }
    }
    return $out
}

# Map BT address (last 12 hex chars) -> PnP instance ID for reconnect.
$instanceMap = @{}
try {
    Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |
        Where-Object { $_.DeviceID -like '${BTHENUM_A2DP_PATTERN}' } |
        ForEach-Object {
            $devId = $_.DeviceID
            $mac = $null
            if ($devId -match '&0&([0-9A-Fa-f]{12})') { $mac = $Matches[1] }
            elseif ($devId -match '_([0-9A-Fa-f]{12})_') { $mac = $Matches[1] }
            if ($mac) { $instanceMap[$mac.ToLower()] = $devId }
        }
} catch { }

$devices = @()
if (Test-Path $capBase) {
    Get-ChildItem -Path $capBase -ErrorAction SilentlyContinue | ForEach-Object {
        $addr = $_.PSChildName
        $capPath = $_.PSPath
        $capProps = Get-ItemProperty -Path $capPath -ErrorAction SilentlyContinue
        $name = $null
        if ($capProps -and ($capProps.PSObject.Properties.Name -contains 'Name')) { $name = [string]$capProps.Name }

        $key12 = $addr.ToLower()
        if ($key12.Length -gt 12) { $key12 = $key12.Substring($key12.Length - 12) }
        $instanceId = $instanceMap[$key12]

        $devices += [ordered]@{
            address    = $addr
            name       = $name
            instanceId = $instanceId
            capability = (Read-Values $capPath)
            current    = (Read-Values ('${CURRENT_KEY}' + '\' + $addr))
            next       = (Read-Values ('${NEXT_KEY}' + '\' + $addr))
        }
    }
}

# -InputObject keeps a single-device result as a JSON array (a bare pipeline
# would collapse it to an object).
ConvertTo-Json -InputObject @($devices) -Depth 8 -Compress
`

const STATUS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$isAdmin = $false
try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $isAdmin = ([Security.Principal.WindowsPrincipal]::new($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { }

$driverInstalled = Test-Path '${SERVICE_KEY}'

$svcInstalled = $false
$svcRunning = $false
$svc = Get-Service -Name 'AltA2dpSVC' -ErrorAction SilentlyContinue
if ($svc) {
    $svcInstalled = $true
    $svcRunning = ($svc.Status -eq 'Running')
}

[ordered]@{
    isAdmin         = [bool]$isAdmin
    driverInstalled = [bool]$driverInstalled
    serviceInstalled = [bool]$svcInstalled
    serviceRunning  = [bool]$svcRunning
} | ConvertTo-Json -Compress
`

async function runPowerShell(
  script: string,
  opts: { timeoutMs: number; payload?: unknown } = { timeoutMs: 15_000 }
): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'a2dp-ps-'))
  const scriptPath = join(dir, 'script.ps1')
  try {
    await fs.writeFile(scriptPath, script, 'utf8')

    let args: string[]
    if (opts.payload !== undefined) {
      const payloadPath = join(dir, 'payload.json')
      await fs.writeFile(payloadPath, JSON.stringify(opts.payload), 'utf8')
      args = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-PayloadPath',
        payloadPath
      ]
    } else {
      args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]
    }

    const { stdout } = await execFileAsync(PS_EXE, args, {
      timeout: opts.timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8'
    })
    // Strip a UTF-8 BOM that Windows PowerShell can prepend to redirected output.
    return stdout.replace(/^\uFEFF/, '').trim()
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function toNumberMap(raw: unknown): RegistryValues | null {
  if (!raw || typeof raw !== 'object') return null
  const out: RegistryValues = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) out[k] = n
  }
  return Object.keys(out).length ? out : null
}

export class PowerShellProvider implements DriverProvider {
  readonly kind = 'powershell' as const
  readonly writable = true

  async status(): Promise<DriverStatus> {
    let parsed: Partial<DriverStatus> = {}
    let message: string | null = null
    try {
      const raw = await runPowerShell(STATUS_SCRIPT, { timeoutMs: 20_000 })
      parsed = JSON.parse(raw) as Partial<DriverStatus>
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }

    const driverInstalled = Boolean(parsed.driverInstalled)
    return {
      isWindows: true,
      isAdmin: Boolean(parsed.isAdmin),
      driverInstalled,
      serviceInstalled: Boolean(parsed.serviceInstalled),
      serviceRunning: Boolean(parsed.serviceRunning),
      mock: false,
      message: message ?? (driverInstalled ? null : 'AltA2DP registry key was not found.')
    }
  }

  async readDevices(): Promise<DeviceState[]> {
    const raw = await runPowerShell(READ_SCRIPT, { timeoutMs: 30_000 })
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    const arr = Array.isArray(parsed) ? parsed : [parsed]

    return arr
      .filter((d): d is Record<string, unknown> => Boolean(d) && typeof d === 'object')
      .map((d) => {
        const capability = toNumberMap(d.capability) ?? {}
        return {
          address: String(d.address ?? '').toLowerCase(),
          name: typeof d.name === 'string' ? d.name : '',
          instanceId: typeof d.instanceId === 'string' ? d.instanceId : null,
          capability,
          current: toNumberMap(d.current),
          next: toNumberMap(d.next)
        } satisfies DeviceState
      })
      .filter((d) => /^[0-9a-f]{12,16}$/.test(d.address))
  }

  async writeNext(address: string, values: Record<string, number>): Promise<string[]> {
    if (!/^[0-9a-f]{12,16}$/i.test(address)) {
      throw new Error(`Refusing to write to invalid device address: ${address}`)
    }
    const clean: Record<string, number> = {}
    for (const [key, value] of Object.entries(values)) {
      if (!WRITABLE_VALUES.has(key)) throw new Error(`Value "${key}" is not writable`)
      if (!Number.isFinite(value)) throw new Error(`Value "${key}" must be a finite number`)
      clean[key] = Math.trunc(value)
    }
    if (Object.keys(clean).length === 0) return []

    const raw = await runPowerShell(WRITE_SCRIPT, {
      timeoutMs: 30_000,
      payload: { address, values: clean }
    })
    const written = raw ? (JSON.parse(raw) as string[]) : []
    return Array.isArray(written) ? written : []
  }

  async reconnect(instanceId: string): Promise<void> {
    if (!instanceId || /['"`$;|]/.test(instanceId)) {
      throw new Error('Invalid PnP instance ID')
    }
    await runPowerShell(RECONNECT_SCRIPT, {
      timeoutMs: 60_000,
      payload: { instanceId }
    })
  }
}

const WRITE_SCRIPT = String.raw`
param([Parameter(Mandatory=$true)][string]$PayloadPath)
$ErrorActionPreference = 'Stop'
$payload = Get-Content -Raw -Path $PayloadPath | ConvertFrom-Json

$addr = [string]$payload.address
if ($addr -notmatch '^[0-9a-fA-F]{12,16}$') { throw "Invalid address" }

$nextPath = '${NEXT_KEY}\' + $addr
if (-not (Test-Path $nextPath)) {
    New-Item -Path $nextPath -Force | Out-Null
}

$written = @()
foreach ($prop in $payload.values.PSObject.Properties) {
    $name = $prop.Name
    $value = [int64]$prop.Value
    # DWORD is unsigned in the registry; wrap negatives (e.g. VolumeLevel).
    if ($value -lt 0) { $value = $value -band 0xFFFFFFFF }
    Set-ItemProperty -Path $nextPath -Name $name -Value ([uint32]$value) -Type DWord
    $written += $name
}
@($written) | ConvertTo-Json -Compress
`

const RECONNECT_SCRIPT = String.raw`
param([Parameter(Mandatory=$true)][string]$PayloadPath)
$ErrorActionPreference = 'Stop'
$payload = Get-Content -Raw -Path $PayloadPath | ConvertFrom-Json
$instanceId = [string]$payload.instanceId
if ($instanceId -notmatch '^[A-Za-z0-9_\\&{}\.\-]+$') { throw "Invalid instance ID" }

Disable-PnpDevice -InstanceId $instanceId -Confirm:$false -ErrorAction Stop
Start-Sleep -Seconds 2
Enable-PnpDevice -InstanceId $instanceId -Confirm:$false -ErrorAction Stop
`
