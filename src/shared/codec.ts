/**
 * Domain model shared between the Electron main process and the React renderer.
 *
 * Registry layout (all DWORD unless noted):
 *   HKLM\SYSTEM\CurrentControlSet\Services\AltA2DP\Parameters\Devices\
 *     Capability\{addr}\  read-only  - remote device support, values are bitmasks
 *     Current\{addr}\     read-only  - live negotiated state
 *     Next\{addr}\        writable   - applied on the next reconnect
 *
 * {addr} is a 16-char lowercase hex Bluetooth address, e.g. 0000340e224a88bb.
 */

/** Codec identifiers used throughout the app. */
export type CodecId = 'SBC' | 'AAC' | 'LDAC' | 'APTX' | 'APTX_HD' | 'APTX_LL'

/**
 * The `Codec` DWORD is a 6-bit bitmask (not an enum). In `Capability` it is the
 * OR of every codec the peer advertised; in `Current`/`Next` exactly one bit is
 * set. Bit values confirmed against AltA2DP.sys v1.8.3.1.
 */
export const CODEC_BITS: Record<CodecId, number> = {
  SBC: 0x01,
  AAC: 0x02,
  LDAC: 0x04,
  APTX: 0x08,
  APTX_HD: 0x10,
  APTX_LL: 0x20
}

export const CODEC_ORDER: CodecId[] = ['SBC', 'AAC', 'LDAC', 'APTX', 'APTX_HD', 'APTX_LL']

export type FieldKind = 'select' | 'range' | 'toggle'

export interface SelectOption {
  value: number
  label: string
}

export interface CodecField {
  /** Registry value name, e.g. "SbcChannelMode". */
  key: string
  label: string
  kind: FieldKind
  /**
   * For `select`: the selectable single values.
   */
  options?: SelectOption[]
  /**
   * For `select`: whether the Capability value is a bitmask to intersect with
   * `options` (true, the default) or a plain enum where every option is valid
   * (false, e.g. LDAC quality mode where 0 is a real value).
   */
  bitmask?: boolean
  /** For `range`: bounds and step. */
  min?: number
  max?: number
  step?: number
  unit?: string
  help?: string
  /**
   * For `range`: the value that means "let the device/encoder decide". Shown as
   * "Auto" in the UI and never written as a literal slider position.
   */
  autoValue?: number
  /**
   * For `range`: registry value in Capability that advertises the device max
   * (used to clamp the slider). Falls back to `max`.
   */
  capabilityMaxKey?: string
}

export interface CodecMeta {
  id: CodecId
  label: string
  bit: number
  /** Registry key holding the channel-mode capability; 0 => unsupported. */
  channelModeKey: string
  blurb: string
  fields: CodecField[]
}

const CHANNEL_MODE_STEREO_MONO: SelectOption[] = [
  { value: 1, label: 'Mono' },
  { value: 2, label: 'Stereo' }
]

export const CODECS: Record<CodecId, CodecMeta> = {
  SBC: {
    id: 'SBC',
    label: 'SBC',
    bit: CODEC_BITS.SBC,
    channelModeKey: 'SbcChannelMode',
    blurb: 'Mandatory baseline codec. Works everywhere; tune the bitpool for quality.',
    fields: [
      {
        key: 'SbcChannelMode',
        label: 'Channel Mode',
        kind: 'select',
        options: [
          { value: 1, label: 'Joint Stereo' },
          { value: 2, label: 'Stereo' },
          { value: 4, label: 'Dual Channel' },
          { value: 8, label: 'Mono' }
        ]
      },
      {
        key: 'SbcSamplingFrequency',
        label: 'Sampling Frequency',
        kind: 'select',
        options: [
          { value: 1, label: '48 kHz' },
          { value: 2, label: '44.1 kHz' },
          { value: 4, label: '32 kHz' },
          { value: 8, label: '16 kHz' }
        ]
      },
      {
        key: 'SbcAllocationMethod',
        label: 'Allocation Method',
        kind: 'select',
        options: [
          { value: 1, label: 'Loudness' },
          { value: 2, label: 'SNR' }
        ]
      },
      {
        key: 'SbcSubbands',
        label: 'Subbands',
        kind: 'select',
        options: [
          { value: 1, label: '8 subbands' },
          { value: 2, label: '4 subbands' }
        ]
      },
      {
        key: 'SbcBlockLength',
        label: 'Block Length',
        kind: 'select',
        options: [
          { value: 1, label: '16' },
          { value: 2, label: '12' },
          { value: 4, label: '8' },
          { value: 8, label: '4' }
        ]
      },
      {
        key: 'SbcMinimumBitpool',
        label: 'Minimum Bitpool',
        kind: 'range',
        min: 2,
        max: 250,
        step: 1,
        help: 'Lower bound the encoder may use. 53 is the standard maximum.'
      },
      {
        key: 'SbcMaximumBitpool',
        label: 'Maximum Bitpool',
        kind: 'range',
        min: 2,
        max: 250,
        step: 1,
        help: 'Upper bound the encoder may use. Higher bitpool = higher bitrate.'
      },
      {
        key: 'AbrEnable',
        label: 'Adaptive Bitrate (ABR)',
        kind: 'toggle',
        help: 'Let the encoder drop the bitpool when the link degrades.'
      }
    ]
  },
  AAC: {
    id: 'AAC',
    label: 'AAC',
    bit: CODEC_BITS.AAC,
    channelModeKey: 'AacChannelMode',
    blurb: 'Better quality than SBC at the same bitrate on most Apple/Android gear.',
    fields: [
      {
        key: 'AacChannelMode',
        label: 'Channel Mode',
        kind: 'select',
        options: [
          { value: 4, label: 'Stereo' },
          { value: 8, label: 'Mono' }
        ]
      },
      {
        key: 'AacSamplingFrequency',
        label: 'Sampling Frequency',
        kind: 'select',
        options: [
          { value: 8, label: '44.1 kHz' },
          { value: 16, label: '48 kHz' }
        ]
      },
      {
        key: 'AacBitrate',
        label: 'Target Bitrate',
        kind: 'range',
        min: 32000,
        max: 320000,
        step: 8000,
        unit: 'bps',
        autoValue: 0,
        capabilityMaxKey: 'AacPeakBitrate',
        help: '0 = device default (shown as Auto).'
      },
      {
        key: 'AacPeakBitrate',
        label: 'Peak Bitrate',
        kind: 'range',
        min: 32000,
        max: 512000,
        step: 8000,
        unit: 'bps',
        autoValue: 0,
        capabilityMaxKey: 'AacPeakBitrate',
        help: 'Upper bound for variable-bitrate encoding. 0 = device default.'
      }
    ]
  },
  LDAC: {
    id: 'LDAC',
    label: 'LDAC',
    bit: CODEC_BITS.LDAC,
    channelModeKey: 'LdacChannelMode',
    blurb: "Sony's hi-res codec. Up to 990 kbps / 96 kHz / 24-bit.",
    fields: [
      {
        key: 'LdacChannelMode',
        label: 'Channel Mode',
        kind: 'select',
        options: [
          { value: 1, label: 'Stereo' },
          { value: 2, label: 'Dual Channel' },
          { value: 4, label: 'Mono' }
        ]
      },
      {
        key: 'LdacSamplingFrequency',
        label: 'Sampling Frequency',
        kind: 'select',
        options: [
          { value: 1, label: '44.1 kHz' },
          { value: 2, label: '48 kHz' },
          { value: 4, label: '88.2 kHz' },
          { value: 8, label: '96 kHz' }
        ]
      },
      {
        key: 'LdacSampleFormat',
        label: 'Sample Format',
        kind: 'select',
        options: [
          { value: 1, label: '16-bit' },
          { value: 2, label: '24-bit' },
          { value: 4, label: '32-bit' }
        ]
      },
      {
        key: 'LdacEqmid',
        label: 'Quality Mode',
        kind: 'select',
        bitmask: false,
        options: [
          { value: 0, label: 'Quality (990 kbps)' },
          { value: 1, label: 'Normal (660 kbps)' },
          { value: 2, label: 'Connection (330 kbps)' },
          { value: 3, label: 'Adaptive (ABR)' }
        ]
      }
    ]
  },
  APTX: {
    id: 'APTX',
    label: 'aptX',
    bit: CODEC_BITS.APTX,
    channelModeKey: 'AptxChannelMode',
    blurb: 'Qualcomm codec, ~352 kbps, low complexity.',
    fields: [
      { key: 'AptxChannelMode', label: 'Channel Mode', kind: 'select', options: CHANNEL_MODE_STEREO_MONO },
      {
        key: 'AptxSamplingFrequency',
        label: 'Sampling Frequency',
        kind: 'select',
        options: [
          { value: 1, label: '44.1 kHz' },
          { value: 2, label: '48 kHz' }
        ]
      }
    ]
  },
  APTX_HD: {
    id: 'APTX_HD',
    label: 'aptX HD',
    bit: CODEC_BITS.APTX_HD,
    channelModeKey: 'AptxHdChannelMode',
    blurb: 'Qualcomm 24-bit codec, ~576 kbps.',
    fields: [
      { key: 'AptxHdChannelMode', label: 'Channel Mode', kind: 'select', options: CHANNEL_MODE_STEREO_MONO },
      {
        key: 'AptxHdSamplingFrequency',
        label: 'Sampling Frequency',
        kind: 'select',
        options: [
          { value: 1, label: '44.1 kHz' },
          { value: 2, label: '48 kHz' }
        ]
      },
      {
        key: 'AptxHdSampleFormat',
        label: 'Sample Format',
        kind: 'select',
        options: [
          { value: 1, label: '16-bit' },
          { value: 2, label: '24-bit' }
        ]
      }
    ]
  },
  APTX_LL: {
    id: 'APTX_LL',
    label: 'aptX LL',
    bit: CODEC_BITS.APTX_LL,
    channelModeKey: 'AptxLlChannelMode',
    blurb: 'Low-latency (~50 ms) variant for gaming and video.',
    fields: [
      { key: 'AptxLlChannelMode', label: 'Channel Mode', kind: 'select', options: CHANNEL_MODE_STEREO_MONO },
      {
        key: 'AptxLlSamplingFrequency',
        label: 'Sampling Frequency',
        kind: 'select',
        options: [
          { value: 1, label: '44.1 kHz' },
          { value: 2, label: '48 kHz' }
        ]
      }
    ]
  }
}

/** Codec a phone call (SCO) forces, when A2DP is suspended. */
export const SCO_CODEC = 'mSBC / CVSD'

/**
 * Codecs whose bit is set in a registry `Codec` value, in canonical order so
 * labels read consistently ("SBC, AAC").
 */
export function decodeCodecMask(mask: number | null | undefined): CodecId[] {
  if (mask == null) return []
  return CODEC_ORDER.filter((id) => (mask & CODEC_BITS[id]) !== 0)
}

export function codecLabel(mask: number | null | undefined): string {
  const ids = decodeCodecMask(mask)
  return ids.length ? ids.map((id) => CODECS[id].label).join(' + ') : 'None'
}

/** True if the device advertises support for a codec. */
export function isCodecSupported(capability: Record<string, number>, id: CodecId): boolean {
  const mask = capability.Codec ?? 0
  if ((mask & CODEC_BITS[id]) !== 0) return true
  // Fallback for firmware that leaves the Codec bit clear but fills the
  // per-codec channel mode: a non-zero channel mode means "supported".
  const channelMode = capability[CODECS[id].channelModeKey] ?? 0
  return channelMode !== 0
}

export function supportedCodecs(capability: Record<string, number>): CodecId[] {
  return CODEC_ORDER.filter((id) => isCodecSupported(capability, id))
}

/**
 * Selectable options for a `select` field, filtered by the capability bitmask.
 * A capability value of 0 for the field means "unadvertised" and we fall back to
 * the full option list so the UI stays usable on incomplete firmware data.
 * Fields marked `bitmask: false` are plain enums and are never filtered.
 */
export function supportedOptions(field: CodecField, capability: Record<string, number>): SelectOption[] {
  if (field.kind !== 'select' || !field.options) return []
  if (field.bitmask === false) return field.options
  const cap = capability[field.key]
  if (cap == null || cap === 0) return field.options
  const filtered = field.options.filter((o) => (cap & o.value) !== 0)
  return filtered.length ? filtered : field.options
}

/** Upper bound for a `range` field, using the device-advertised max if present. */
export function rangeMax(field: CodecField, capability: Record<string, number>): number {
  const fallback = field.max ?? 250
  if (!field.capabilityMaxKey) return fallback
  const advertised = capability[field.capabilityMaxKey]
  if (!advertised || advertised <= 0) return fallback
  return Math.min(advertised, field.max ?? advertised)
}

export function formatBitrate(bps: number | null | undefined): string {
  if (bps == null || bps <= 0) return '—'
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`
  return `${Math.round(bps / 1000)} kbps`
}

export function formatDelay(delayUnits: number | null | undefined): string {
  if (delayUnits == null || delayUnits < 0) return '—'
  return `${(delayUnits / 10).toFixed(1)} ms`
}

export function formatAddress(addr: string): string {
  const upper = addr.toUpperCase()
  if (upper.length !== 12 && upper.length !== 16) return upper
  const last12 = upper.slice(-12)
  return last12.match(/.{2}/g)?.join(':') ?? upper
}
