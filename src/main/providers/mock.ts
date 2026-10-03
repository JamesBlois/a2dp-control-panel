import { CODEC_BITS, CODECS, decodeCodecMask, type CodecId } from '@shared/codec'
import type { DeviceState, DriverStatus, RegistryValues } from '@shared/types'
import type { DriverProvider } from './types'

interface MockDevice {
  address: string
  name: string
  instanceId: string
  capability: RegistryValues
  next: RegistryValues
  current: RegistryValues
  connected: boolean
  disabled: boolean
  baseDelayUnits: number
  tick: number
}

/** Nominal bitrate for a codec given its negotiated parameters. */
function estimateBitrate(codec: CodecId, values: RegistryValues): number {
  switch (codec) {
    case 'SBC': {
      const bitpool = values.SbcMaximumBitpool ?? 53
      const joint = (values.SbcChannelMode ?? 1) === 1
      // Rough SBC bitrate model: ~2 * bitpool * frames/s for joint stereo.
      const framesPerSec = 344 // ~ 44.1kHz / 128 samples
      const channels = joint ? 1.6 : 2
      return Math.round((bitpool * framesPerSec * channels) / 1.6) * 8
    }
    case 'AAC':
      return values.AacBitrate && values.AacBitrate > 0 ? values.AacBitrate : 256000
    case 'LDAC': {
      const mode = values.LdacEqmid ?? 0
      if (mode === 0) return 990000
      if (mode === 1) return 660000
      if (mode === 2) return 330000
      return 700000
    }
    case 'APTX':
      return 352000
    case 'APTX_HD':
      return 576000
    case 'APTX_LL':
      return 352000
    default:
      return 256000
  }
}

function nominalDelayUnits(codec: CodecId): number {
  return codec === 'APTX_LL' ? 500 : 1700
}

function supportedMask(ids: CodecId[]): number {
  return ids.reduce((acc, id) => acc | CODEC_BITS[id], 0)
}

const SBC_CAPS: RegistryValues = {
  SbcChannelMode: 15,
  SbcSamplingFrequency: 15,
  SbcAllocationMethod: 3,
  SbcSubbands: 3,
  SbcBlockLength: 15,
  SbcMinimumBitpool: 2,
  SbcMaximumBitpool: 53,
  AbrEnable: 1
}

function makeDevice(
  address: string,
  name: string,
  codecs: CodecId[],
  extra: RegistryValues,
  preferred: CodecId,
  connected: boolean
): MockDevice {
  const capability: RegistryValues = {
    Codec: supportedMask(codecs),
    ...SBC_CAPS,
    ...extra
  }
  const defaults = defaultParams(preferred, capability)
  const next: RegistryValues = { Codec: CODEC_BITS[preferred], ...defaults }
  return {
    address,
    name,
    instanceId: `BTHENUM\\{0000110B-0000-1000-8000-00805F9B34FB}_VID&0001004C_PID&2027\\9&3A3A251&0&${address.slice(-12).toUpperCase()}_C00000000`,
    capability,
    next,
    current: { ...next, Opened: connected ? 1 : 0 },
    connected,
    disabled: false,
    baseDelayUnits: nominalDelayUnits(preferred),
    tick: 0
  }
}

/** Sensible first-guess values for a codec, clamped to what the device advertises. */
function defaultParams(codec: CodecId, capability: RegistryValues): RegistryValues {
  switch (codec) {
    case 'SBC':
      return {
        SbcChannelMode: 1,
        SbcSamplingFrequency: 1,
        SbcAllocationMethod: 1,
        SbcSubbands: 1,
        SbcBlockLength: 1,
        SbcMinimumBitpool: 2,
        SbcMaximumBitpool: 53,
        AbrEnable: 1
      }
    case 'AAC':
      return {
        AacChannelMode: 4,
        AacSamplingFrequency: 8,
        AacBitrate: 0,
        AacPeakBitrate: capability.AacPeakBitrate ?? 0
      }
    case 'LDAC':
      return {
        LdacChannelMode: 1,
        LdacSamplingFrequency: 2,
        LdacSampleFormat: 2,
        LdacEqmid: 0
      }
    case 'APTX':
      return { AptxChannelMode: 2, AptxSamplingFrequency: 1 }
    case 'APTX_HD':
      return { AptxHdChannelMode: 2, AptxHdSamplingFrequency: 1, AptxHdSampleFormat: 2 }
    case 'APTX_LL':
      return { AptxLlChannelMode: 2, AptxLlSamplingFrequency: 1 }
    default:
      return {}
  }
}

function initialDevices(): MockDevice[] {
  return [
    makeDevice(
      '0000340e224a88bb',
      'My AirPods Pro',
      ['SBC', 'AAC'],
      {
        AacChannelMode: 12,
        AacSamplingFrequency: 24,
        AacBitrate: 256000,
        AacPeakBitrate: 320000
      },
      'AAC',
      true
    ),
    makeDevice(
      '000070f94aa804e3',
      'WH-1000XM4',
      ['SBC', 'AAC', 'LDAC', 'APTX', 'APTX_HD'],
      {
        AacChannelMode: 12,
        AacSamplingFrequency: 24,
        AacBitrate: 256000,
        AacPeakBitrate: 376875,
        LdacChannelMode: 1,
        LdacSamplingFrequency: 15,
        LdacSampleFormat: 3,
        LdacEqmid: 0,
        AptxChannelMode: 2,
        AptxSamplingFrequency: 3,
        AptxHdChannelMode: 2,
        AptxHdSamplingFrequency: 3,
        AptxHdSampleFormat: 3
      },
      'LDAC',
      true
    ),
    makeDevice(
      '0000a1b2c3d4e5f6',
      'SoundBlaster BT-W5',
      ['SBC', 'APTX', 'APTX_LL'],
      {
        AptxChannelMode: 2,
        AptxSamplingFrequency: 3,
        AptxLlChannelMode: 2,
        AptxLlSamplingFrequency: 3
      },
      'APTX_LL',
      true
    ),
    makeDevice(
      '0000112233445566',
      'Bose QC45',
      ['SBC', 'AAC'],
      {
        AacChannelMode: 12,
        AacSamplingFrequency: 24,
        AacBitrate: 0,
        AacPeakBitrate: 0
      },
      'SBC',
      false
    )
  ]
}

/**
 * Simulated backend. Devices, capabilities and live counters are synthesized so
 * the full UI can be exercised without a Windows host. Written values persist
 * for the lifetime of the process and are reflected in the live view.
 */
export class MockProvider implements DriverProvider {
  readonly kind = 'mock' as const
  readonly writable = true

  private devices: MockDevice[] = initialDevices()
  private readonly dynamic = process.env.A2DP_MOCK_DYNAMIC === '1'
  private pollCount = 0

  async status(): Promise<DriverStatus> {
    return {
      isWindows: false,
      isAdmin: false,
      driverInstalled: false,
      devicesKeyPresent: false,
      keysFound: [],
      serviceInstalled: false,
      serviceRunning: false,
      mock: true,
      message: 'Simulated backend active — no real AltA2DP driver is present on this machine.',
      debug: null
    }
  }

  async readDevices(): Promise<DeviceState[]> {
    this.pollCount += 1
    for (const d of this.devices) this.advance(d)

    if (this.dynamic) {
      // Flip one device roughly every 20 polls to demonstrate connect/disconnect.
      if (this.pollCount % 20 === 0) {
        const d = this.devices[3]
        d.connected = !d.connected
        d.current.Opened = d.connected ? 1 : 0
      }
    }

    return this.devices.map((d) => ({
      address: d.address,
      name: d.name,
      instanceId: d.instanceId,
      disabled: d.disabled,
      capability: { ...d.capability },
      current: { ...d.current },
      next: { ...d.next }
    }))
  }

  async writeNext(address: string, values: Record<string, number>): Promise<string[]> {
    const d = this.devices.find((x) => x.address === address)
    if (!d) throw new Error(`Unknown device ${address}`)
    for (const [k, v] of Object.entries(values)) d.next[k] = v
    d.tick = 0
    return Object.keys(values)
  }

  async reconnect(instanceId: string): Promise<void> {
    const d = this.devices.find((x) => x.instanceId === instanceId)
    if (!d) throw new Error(`Unknown instance ${instanceId}`)
    await new Promise((r) => setTimeout(r, 400))
    d.current = { ...d.next, Opened: 1 }
    d.connected = true
    d.disabled = false
    d.tick = 0
    d.baseDelayUnits = nominalDelayUnits(primaryCodec(d.next))
  }

  async enableDevice(instanceId: string): Promise<void> {
    await this.reconnect(instanceId)
  }

  /** Advance the simulated live counters (bitrate jitter, delay, SCO). */
  private advance(d: MockDevice): void {
    d.tick += 1
    if (!d.connected) {
      d.current.Opened = 0
      d.current.Bitrate = 0
      d.current.Delay = 0
      d.current.ScoActive = 0
      return
    }
    const codec = primaryCodec(d.current)
    const nominal = estimateBitrate(codec, d.current)
    const jitter = Math.round(nominal * 0.03 * Math.sin(d.tick / 3))
    d.current.Opened = 1
    d.current.Bitrate = Math.max(0, nominal + jitter)
    d.current.Delay = d.baseDelayUnits + Math.round(60 * Math.sin(d.tick / 5))
    // Brief simulated phone call on one device every ~30 polls.
    d.current.ScoActive = d.name === 'WH-1000XM4' && this.pollCount % 30 > 26 ? 1 : 0
    d.current.Error = 0
  }
}

function primaryCodec(values: RegistryValues): CodecId {
  const ids = decodeCodecMask(values.Codec)
  return ids.length ? ids[0] : 'SBC'
}

/** Exposed so the UI/dev tooling can show which codecs a mock device supports. */
export { CODECS }
