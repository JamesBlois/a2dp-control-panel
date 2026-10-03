import {
  CODECS,
  decodeCodecMask,
  isCodecSupported,
  supportedCodecs,
  type CodecId
} from '@shared/codec'
import type { DeviceState, DeviceView, RegistryValues } from '@shared/types'

/** Signature of the values that matter when deciding "is Next pending?". */
function configSignature(codec: CodecId, values: RegistryValues): string {
  const fields = CODECS[codec].fields.map((f) => `${f.key}=${values[f.key] ?? ''}`)
  return `${codec}|${fields.join('|')}`
}

function firstCodec(mask: number | null | undefined): CodecId | null {
  const ids = decodeCodecMask(mask)
  return ids.length ? ids[0] : null
}

export function deriveDeviceView(state: DeviceState): DeviceView {
  const cap = state.capability
  const cur = state.current
  const next = state.next

  const supports = supportedCodecs(cap)
  const currentCodec = cur ? firstCodec(cur.Codec) : null
  const nextCodec = next ? firstCodec(next.Codec) : null

  let pendingChanges = false
  if (next && nextCodec) {
    if (cur && cur.Codec != null) {
      pendingChanges = configSignature(nextCodec, next) !== configSignature(currentCodec ?? nextCodec, cur)
    } else {
      pendingChanges = true
    }
  }

  const name = state.name && state.name.trim().length ? state.name.trim() : `Unknown (${state.address})`

  return {
    address: state.address,
    name,
    instanceId: state.instanceId,
    connected: (cur?.Opened ?? 0) === 1,
    scoActive: (cur?.ScoActive ?? 0) === 1,
    disabled: state.disabled,
    capability: cap,
    nextValues: next ?? {},
    currentValues: cur,
    supports,
    currentCodec,
    nextCodec,
    currentBitrate: cur?.Bitrate ?? 0,
    currentDelayUnits: cur?.Delay ?? null,
    error: cur?.Error ?? 0,
    pendingChanges
  }
}

export function deriveDevices(states: DeviceState[]): DeviceView[] {
  return states
    .map(deriveDeviceView)
    .sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

/** Exposed for the mock provider and tests. */
export { isCodecSupported }
