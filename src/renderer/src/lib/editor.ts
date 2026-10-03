import { CODECS, CODEC_BITS, decodeCodecMask, rangeMax, supportedOptions, type CodecId } from '@shared/codec'
import type { DeviceView, RegistryValues } from '@shared/types'

/** First-guess values for a codec, respecting the device's advertised options. */
export function defaultValues(codec: CodecId, capability: RegistryValues): RegistryValues {
  const out: RegistryValues = { Codec: CODEC_BITS[codec] }
  for (const field of CODECS[codec].fields) {
    if (field.kind === 'select') {
      out[field.key] = supportedOptions(field, capability)[0]?.value ?? field.options?.[0]?.value ?? 0
    } else if (field.kind === 'range') {
      out[field.key] = field.autoValue !== undefined ? field.autoValue : (field.min ?? 0)
    } else {
      out[field.key] = 0
    }
  }
  return out
}

/**
 * Seed the settings editor for a codec: prefer what is already queued in Next,
 * fall back to the live Current values, then to schema defaults. Missing keys are
 * filled from defaults so switching codecs never leaves a field blank.
 */
export function seedValues(device: DeviceView, codec: CodecId): RegistryValues {
  const defaults = defaultValues(codec, device.capability)
  const source =
    device.nextCodec === codec
      ? device.nextValues
      : device.currentCodec === codec
        ? (device.currentValues ?? {})
        : {}

  const out: RegistryValues = { ...defaults, Codec: CODEC_BITS[codec] }
  for (const field of CODECS[codec].fields) {
    const v = source[field.key]
    if (typeof v === 'number') out[field.key] = v
  }
  return out
}

/** True when the editor values differ from what is currently queued in Next. */
export function isDirty(device: DeviceView, codec: CodecId, values: RegistryValues): boolean {
  if (device.nextCodec !== codec) return true
  for (const field of CODECS[codec].fields) {
    if ((device.nextValues[field.key] ?? null) !== (values[field.key] ?? null)) return true
  }
  return false
}

/**
 * Validate editor values against the schema, clamping ranges and dropping
 * options the device does not advertise. Mirrors the main-process validation so
 * the UI can show accurate values before Apply.
 */
export function normalizeValues(
  codec: CodecId,
  values: RegistryValues,
  capability: RegistryValues
): RegistryValues {
  const out: RegistryValues = { Codec: CODEC_BITS[codec] }
  for (const field of CODECS[codec].fields) {
    const raw = values[field.key]
    if (raw === undefined) continue
    if (field.kind === 'select') {
      const allowed = supportedOptions(field, capability)
      out[field.key] = allowed.some((o) => o.value === raw)
        ? raw
        : (allowed[0]?.value ?? field.options?.[0]?.value ?? 0)
    } else if (field.kind === 'range') {
      if (field.autoValue !== undefined && raw === field.autoValue) {
        out[field.key] = raw
      } else {
        const min = field.min ?? 0
        const max = rangeMax(field, capability)
        out[field.key] = Math.min(max, Math.max(min, Math.round(raw)))
      }
    } else {
      out[field.key] = raw ? 1 : 0
    }
  }
  return out
}

/** The codec currently negotiated (or queued) for a device. */
export function activeCodec(device: DeviceView): CodecId | null {
  return device.nextCodec ?? device.currentCodec ?? decodeCodecMask(device.capability.Codec)[0] ?? null
}
