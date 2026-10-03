import { CODECS, CODEC_BITS, isCodecSupported, supportedOptions, rangeMax } from '@shared/codec'
import type { ApplyRequest, ApplyResult, DeviceView } from '@shared/types'
import type { DriverProvider } from '../providers/types'

/**
 * Validate an apply request against the device's advertised capability and the
 * codec schema, then write the sanitized values to the Next subkey.
 *
 * The renderer is treated as untrusted: only allow-listed registry names are
 * written, the codec bit must match a codec the device actually advertises, and
 * select/range values are checked (or clamped) against the schema.
 */
export async function applySettings(
  provider: DriverProvider,
  device: DeviceView,
  request: ApplyRequest
): Promise<ApplyResult> {
  const warnings: string[] = []
  const meta = CODECS[request.codec]
  if (!meta) throw new Error(`Unknown codec: ${request.codec}`)

  if (!isCodecSupported(device.capability, request.codec)) {
    throw new Error(`${meta.label} is not advertised as supported by ${device.name}`)
  }

  const values: Record<string, number> = { Codec: CODEC_BITS[request.codec] }

  for (const field of meta.fields) {
    const raw = request.values[field.key]
    if (raw === undefined) continue
    if (!Number.isFinite(raw)) continue

    if (field.kind === 'toggle') {
      values[field.key] = raw ? 1 : 0
      continue
    }

    if (field.kind === 'select') {
      const allowed = supportedOptions(field, device.capability)
      if (!allowed.some((o) => o.value === raw)) {
        warnings.push(`${field.label}: ${raw} is not advertised; keeping ${allowed[0]?.label ?? 'default'}`)
        if (allowed[0]) values[field.key] = allowed[0].value
        continue
      }
      values[field.key] = raw
      continue
    }

    if (field.kind === 'range') {
      if (field.autoValue !== undefined && raw === field.autoValue) {
        values[field.key] = raw
        continue
      }
      const min = field.min ?? 0
      const max = rangeMax(field, device.capability)
      const clamped = Math.min(max, Math.max(min, Math.round(raw)))
      if (clamped !== raw) warnings.push(`${field.label}: clamped ${raw} -> ${clamped}`)
      values[field.key] = clamped
    }
  }

  // VolumeLevel is codec-independent and optional.
  if (request.values.VolumeLevel !== undefined && Number.isFinite(request.values.VolumeLevel)) {
    const v = Math.max(-127, Math.min(0, Math.round(request.values.VolumeLevel)))
    values.VolumeLevel = v
  }

  const written = await provider.writeNext(device.address, values)

  let reconnected = false
  if (request.reconnect) {
    if (!device.instanceId) {
      warnings.push('Could not resolve the PnP instance ID, so the device was not cycled.')
    } else {
      await provider.reconnect(device.instanceId)
      reconnected = true
    }
  }

  return { written, reconnected, warnings }
}
