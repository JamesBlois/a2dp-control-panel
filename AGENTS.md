# AGENTS.md

## Project

A2DP Control Panel — an Electron + React + TypeScript GUI that configures the
Alternative A2DP Driver (Luculent Systems) on Windows by reading/writing its
registry keys and cycling PnP devices. This app does **not** install the driver.

## Commands

```bash
npm install
npm run dev          # full Electron app (Windows)
npm run typecheck    # tsc, node + web projects
npm run test         # vitest (tests/)
npm run build        # typecheck + electron-vite build -> out/
npm run dist         # Windows NSIS installer -> release/
npm run renderer:dev # browser-only UI preview (mock backend) on :5273
```

Environment overrides for the backend: `A2DP_FORCE_MOCK=1` (simulate),
`A2DP_MOCK_DYNAMIC=1` (simulated connect/disconnect events),
`A2DP_PS_EXE=pwsh.exe` (use PowerShell 7).

## Domain gotchas

- **Electron must stay on major 39** while `electron-vite` is on 5.x. Electron 44
  removed its `postinstall` and now downloads its binary lazily from `index.js`,
  but electron-vite's own resolver reads `node_modules/electron/path.txt` and
  throws `Error: Electron uninstall` when it is absent — it never triggers the
  lazy download. Electron 39 still ships `postinstall: node install.js`, which
  creates `path.txt`. electron-vite 5.0.0's Node/Chrome target maps also stop at
  Electron 39. Bumping Electron requires electron-vite >= 6 (currently beta).
  If `path.txt` goes missing: `npm rebuild electron`.
- **The `Codec` DWORD is a 6-bit bitmask, not an enum**: 1=SBC, 2=AAC, 4=LDAC,
  8=aptX, 16=aptX HD, 32=aptX LL. `Capability` holds the OR of supported codecs;
  `Current`/`Next` hold a single bit. Never write multiple bits to `Next`.
- Fields like `LdacEqmid` (quality mode) are **plain enums where 0 is valid**
  (0 = 990 kbps). Do not treat 0 as "unset" for these. In `src/shared/codec.ts`,
  capability-filtered fields are marked `bitmask: true`; enums are left `false`.
- Capability values are bitmasks of options. When a capability value is `0` or
  missing, the field is unadvertised — show all options rather than none.
- `Current.Delay` is in 100 ns units (divide by 10 for ms). `Next.VolumeLevel` is
  a signed 32-bit DWORD (negative = attenuation).
- `AacBitrate`/`AacPeakBitrate` of 0 means "device default" and must be shown as
  **Auto**, never as 0.
- The driver only reads `Next` on reconnect, which is why Apply disables and
  re-enables the PnP device.

## Architecture

- `src/shared/codec.ts` is the single source of truth for codec metadata, option
  bit values and UI fields. Extend codecs here.
- `src/main/providers/powershell.ts` is the real backend; it runs generated
  `.ps1` files (never `-Command`) and passes writes as a JSON payload file so
  device names cannot be interpreted as PowerShell. `mock.ts` is the off-Windows
  stand-in. Both implement `DriverProvider`.
- `src/main/backend/apply.ts` validates requests against capability + schema and
  enforces the `WRITABLE_VALUES` allowlist before writing.
- Renderer falls back to an in-browser mock when `window.a2dp` is absent, so the
  UI can be developed and QA'd in a plain browser.
