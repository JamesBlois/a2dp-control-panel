# A2DP Control Panel

A modern, dark-themed control panel for the **Alternative A2DP Driver** by Luculent
Systems. It configures Bluetooth audio codecs (SBC, AAC, aptX, aptX HD, aptX LL,
LDAC) on Windows 11 by reading and writing the driver's registry keys and cycling
the Bluetooth device so the new settings take effect.

> This app does **not** install, patch or license the driver. It is an alternative
> front end for an already-installed and working AltA2DP installation. The
> `AltA2DP.sys` driver is copyright Luculent Systems, LLC.

---

## Features

- **Device list** — every device the driver knows about, with a live
  connected/disconnected indicator, the currently negotiated codec, and a
  "pending" badge when queued settings differ from what is live. Newly paired
  devices appear automatically.
- **Codec selector** — only the codecs the device actually advertises are
  selectable; unsupported codecs are shown greyed out.
- **Per-codec parameters** — the full option set for each codec, with device
  capability filtering:
  - SBC: channel mode, sampling frequency, allocation method, subbands, block
    length, min/max bitpool sliders, ABR toggle.
  - AAC: channel mode, sampling frequency, target bitrate and peak bitrate
    sliders (clamped to the device's advertised maximum, with an **Auto** option).
  - LDAC: channel mode, sampling frequency, sample format, quality mode
    (990 / 660 / 330 kbps / adaptive).
  - aptX / aptX HD / aptX LL: channel mode, sampling frequency, sample format.
- **Live status bar** — connection state, active codec, real bitrate, transport
  latency (converted from 100 ns units to ms), a coarse link-quality indicator,
  and a phone-call (SCO) indicator.
- **Apply & reconnect** — writes the selected codec and parameters to the
  `Next` registry key, then cycles the PnP device so the driver reconnects with
  the new configuration. Cycling is best-effort: the disable step tries
  `Disable-PnpDevice`, then `Win32_PnPEntity.Disable`, then `pnputil` (a BTHENUM
  service node often rejects the WMI path with `0x80041001`). If the device
  cannot be cycled, the settings are still saved and a warning explains that the
  device needs a manual reconnect.
- **Toasts** — notifications when a device connects, disconnects, or changes codec.
- **Safety rails** — capability-aware validation, an allowlist of writable
  registry values, and clear banners for elevation / driver / service problems.

---

## Requirements

- Windows 10/11 x64
- The Alternative A2DP Driver installed and working (the `AltA2DP` service key
  must exist under `HKLM\SYSTEM\CurrentControlSet\Services\AltA2DP`)
- Administrator rights (writing to `HKLM` and cycling PnP devices both require
  elevation). The installed app requests elevation via its manifest; when running
  from source with `npm run dev` it starts unelevated, and Apply fails with
  "Requested registry access is not allowed". Click **Restart as Administrator**
  in the banner, or launch an elevated terminal before `npm run dev`.
- Node.js 20.19+ or 22.12+ to build from source

> Electron is pinned to **39.x**. Electron 44 dropped the `postinstall` that
> downloads the runtime binary, which `electron-vite` 5.x depends on — using 44
> makes `npm run dev` fail with `Error: Electron uninstall`. See `AGENTS.md`.

---

## Getting started

```bash
npm install

# Run the full desktop app (Windows)
npm run dev

# Type-check, then produce a production build in ./out
npm run build

# Build a Windows installer (NSIS) into ./release
npm run dist
```

> Copy each command on its own line — do not paste the trailing `#` comments into
> your terminal. `electron-vite` takes a positional root argument, so trailing
> text is interpreted as a directory and the app fails with
> "An entry point is required in the electron vite main config".

`npm run dist` produces `release/A2DP Control Panel-<version>-Setup.exe`. The
packaged executable is built with `requestedExecutionLevel: requireAdministrator`,
so Windows prompts for elevation on launch.

### Developing the UI without Windows

The renderer can run on its own in any browser against a simulated backend:

```bash
# start the standalone renderer preview (browser only, simulated backend)
npm run renderer:dev
```

Then open http://localhost:5273

When `window.a2dp` is not present the UI transparently falls back to an
in-browser mock (`src/renderer/src/lib/mockApi.ts`) with four sample devices. This
is how the interface is visually verified during development.

### Running the real backend off-Windows (for testing)

PowerShell:
```powershell
# Force the simulated main-process backend even on Windows
$env:A2DP_FORCE_MOCK=1; npm run dev

# Enable periodic simulated connect/disconnect events
$env:A2DP_MOCK_DYNAMIC=1; npm run dev

# Use PowerShell 7 instead of Windows PowerShell
$env:A2DP_PS_EXE='pwsh.exe'; npm run dev
```

bash (macOS/Linux):
```bash
A2DP_FORCE_MOCK=1 npm run dev
A2DP_MOCK_DYNAMIC=1 npm run dev
A2DP_PS_EXE=pwsh.exe npm run dev
```

---

## Registry schema

Everything lives under:

```
HKLM\SYSTEM\CurrentControlSet\Services\AltA2DP\Parameters\Devices\
  Capability\{bt_address}\   read-only   device support, values are bitmasks
  Current\{bt_address}\      read-only   live negotiated state
  Next\{bt_address}\         writable    applied on the next reconnect
```

`{bt_address}` is a 16-char lowercase hex Bluetooth address, e.g.
`0000340e224a88bb`.

### The `Codec` value is a 6-bit bitmask

| Bit | Value | Codec   |
| --- | ----- | ------- |
| 0   | 0x01  | SBC     |
| 1   | 0x02  | AAC     |
| 2   | 0x04  | LDAC    |
| 3   | 0x08  | aptX    |
| 4   | 0x10  | aptX HD |
| 5   | 0x20  | aptX LL |

In `Capability` the value is the OR of every advertised codec (e.g. `0x2b` =
SBC + AAC + aptX + aptX LL). In `Current`/`Next` exactly one bit is set. Writing
multiple bits to `Next` is undefined.

### Values

Every subkey carries the codec parameter DWORDs (`SbcChannelMode`,
`AacBitrate`, `LdacEqmid`, `AptxHdSampleFormat`, …). `Current` additionally has
`Opened`, `Bitrate`, `ScoActive`, `Delay` (100 ns units) and `Error`; `Next`
additionally has `VolumeLevel` (signed 32-bit, negative = attenuation).

The complete, codec-by-codec parameter tables live in `src/shared/codec.ts` —
that file is the single source of truth for labels, bit values and UI options.

---

## Architecture

```
src/
  shared/            types, codec metadata, registry constants, IPC channel names
  main/              Electron main process
    backend/         provider selection, polling watcher, view derivation, apply
    providers/       powershell.ts (real) and mock.ts (simulated)
  preload/           contextBridge API exposed as window.a2dp
  renderer/          React UI
    src/components/  DeviceList, CodecSelector, CodecParams, StatusBar, Banner, Toasts
    src/hooks/       useA2dp (snapshot + toasts + apply)
    src/lib/         editor state helpers and the browser mock
tests/               vitest unit tests for codec logic and apply validation
```

### How data flows

1. `DeviceWatcher` polls the provider every 2 s (backing off to 10 s when idle).
2. The provider returns raw `Capability` / `Current` / `Next` value maps.
3. `deriveDeviceView` turns those into a UI view: supported codecs, live codec,
   bitrate, delay, pending-change detection.
4. The watcher diffs successive views and emits connect/disconnect/codec events,
   which become toasts.
5. On Apply, the main process validates the request against the device's
   capability and the codec schema, writes the sanitized values to `Next`, then
   cycles the PnP device and forces a refresh.

### Backend implementations

`PowerShellProvider` writes a temporary `.ps1` file and runs it with
`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File`. It
avoids `-Command` and string interpolation so Bluetooth device names cannot be
interpreted as PowerShell code, and it passes data to write scripts as a JSON
payload file. Reads are a single process spawn per poll.

`MockProvider` synthesizes devices and live counters so the app is fully usable
off-Windows and easy to demo.

---

## Security notes

- The renderer runs with `contextIsolation: true` and `nodeIntegration: false`;
  it can only reach the main process through the narrow `window.a2dp` API.
- Writes are restricted to an allowlist of registry value names
  (`WRITABLE_VALUES`). Arbitrary value names are rejected.
- Device addresses and PnP instance IDs are validated against strict patterns
  before being used in any registry path or PnP command.
- The PowerShell helper never interpolates untrusted values into a command line.

## Testing

```bash
npm run test        # vitest
npm run typecheck   # tsc for both node and web projects
```

## License

MIT. Not affiliated with or endorsed by Luculent Systems, LLC.
