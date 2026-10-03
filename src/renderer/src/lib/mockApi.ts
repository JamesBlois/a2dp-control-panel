import {
  CODEC_BITS,
  CODECS,
  decodeCodecMask,
  type CodecId
} from '@shared/codec'
import type {
  ApplyRequest,
  ApplyResult,
  AppSnapshot,
  DeviceEvent,
  DeviceView,
  Result,
  RegistryValues
} from '@shared/types'

/**
 * Browser-only stand-in for the Electron preload API. It mirrors the shape of
 * `window.a2dp` and simulates device state so the UI can be developed and
 * visually reviewed with `npm run renderer:dev` without Electron or Windows.
 *
 * This is intentionally separate from the main-process MockProvider: it runs in
 * the renderer and never touches Node APIs.
 */

function supportedMask(ids: CodecId[]): number {
  return ids.reduce((a, id) => a | CODEC_BITS[id], 0)
}

function params(codec: CodecId, cap: RegistryValues): RegistryValues {
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
      return { AacChannelMode: 4, AacSamplingFrequency: 8, AacBitrate: 0, AacPeakBitrate: cap.AacPeakBitrate ?? 0 }
    case 'LDAC':
      return { LdacChannelMode: 1, LdacSamplingFrequency: 2, LdacSampleFormat: 2, LdacEqmid: 0 }
    case 'APTX':
      return { AptxChannelMode: 2, AptxSamplingFrequency: 1 }
    case 'APTX_HD':
      return { AptxHdChannelMode: 2, AptxHdSamplingFrequency: 1, AptxHdSampleFormat: 2 }
    case 'APTX_LL':
      return { AptxLlChannelMode: 2, AptxLlSamplingFrequency: 1 }
  }
}

function estimate(codec: CodecId, v: RegistryValues): number {
  switch (codec) {
    case 'SBC':
      return Math.round(((v.SbcMaximumBitpool ?? 53) * 344 * 1.6) / 1.6) * 8
    case 'AAC':
      return v.AacBitrate && v.AacBitrate > 0 ? v.AacBitrate : 256000
    case 'LDAC':
      return [990000, 660000, 330000, 700000][v.LdacEqmid ?? 0] ?? 990000
    case 'APTX':
      return 352000
    case 'APTX_HD':
      return 576000
    case 'APTX_LL':
      return 352000
  }
}

interface Sim {
  address: string
  name: string
  instanceId: string
  cap: RegistryValues
  next: RegistryValues
  connected: boolean
  tick: number
}

function build(): Sim[] {
  const mk = (
    address: string,
    name: string,
    codecs: CodecId[],
    extra: RegistryValues,
    preferred: CodecId,
    connected: boolean
  ): Sim => {
    const cap: RegistryValues = {
      Codec: supportedMask(codecs),
      SbcChannelMode: 15,
      SbcSamplingFrequency: 15,
      SbcAllocationMethod: 3,
      SbcSubbands: 3,
      SbcBlockLength: 15,
      SbcMinimumBitpool: 2,
      SbcMaximumBitpool: 53,
      AbrEnable: 1,
      ...extra
    }
    const next = { Codec: CODEC_BITS[preferred], ...params(preferred, cap) }
    return {
      address,
      name,
      instanceId: `BTHENUM\\{0000110B-...\\9&3A3A251&0&${address.slice(-12).toUpperCase()}_C00000000`,
      cap,
      next,
      connected,
      tick: 0
    }
  }
  return [
    mk(
      '0000340e224a88bb',
      'My AirPods Pro',
      ['SBC', 'AAC'],
      { AacChannelMode: 12, AacSamplingFrequency: 24, AacBitrate: 256000, AacPeakBitrate: 320000 },
      'AAC',
      true
    ),
    mk(
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
    mk(
      '0000a1b2c3d4e5f6',
      'SoundBlaster BT-W5',
      ['SBC', 'APTX', 'APTX_LL'],
      { AptxChannelMode: 2, AptxSamplingFrequency: 3, AptxLlChannelMode: 2, AptxLlSamplingFrequency: 3 },
      'APTX_LL',
      true
    ),
    mk(
      '0000112233445566',
      'Bose QC45',
      ['SBC', 'AAC'],
      { AacChannelMode: 12, AacSamplingFrequency: 24, AacBitrate: 0, AacPeakBitrate: 0 },
      'SBC',
      false
    )
  ]
}

function toView(s: Sim): DeviceView {
  const currentCodec = decodeCodecMask(s.next.Codec)[0] ?? null
  const nextCodec = decodeCodecMask(s.next.Codec)[0] ?? null
  return {
    address: s.address,
    name: s.name,
    instanceId: s.instanceId,
    connected: s.connected,
    scoActive: false,
    disabled: false,
    capability: s.cap,
    nextValues: s.next,
    currentValues: s.connected ? { ...s.next, Opened: 1 } : null,
    supports: decodeCodecMask(s.cap.Codec),
    currentCodec: s.connected ? currentCodec : null,
    nextCodec,
    currentBitrate: s.connected && currentCodec ? estimate(currentCodec, s.next) : 0,
    currentDelayUnits: s.connected ? (currentCodec === 'APTX_LL' ? 500 : 1700) : null,
    error: 0,
    pendingChanges: false
  }
}

export function createBrowserMockApi(): NonNullable<Window['a2dp']> {
  const sims = build()
  let listener: ((s: AppSnapshot) => void) | null = null
  const eventListeners = new Set<(e: DeviceEvent) => void>()

  const snapshot = (): AppSnapshot => ({
    status: {
      isWindows: false,
      isAdmin: false,
      driverInstalled: false,
      devicesKeyPresent: false,
      keysFound: [],
      serviceInstalled: false,
      serviceRunning: false,
      mock: true,
      message: 'Browser preview — simulated data. Run the Electron app on Windows for real devices.'
    },
    devices: sims.map(toView),
    timestamp: Date.now()
  })

  setInterval(() => {
    for (const s of sims) {
      s.tick += 1
      if (s.connected) {
        const codec = decodeCodecMask(s.next.Codec)[0] ?? 'SBC'
        const nominal = estimate(codec, s.next)
        s.tick % 1
        void nominal
      }
    }
    listener?.(snapshot())
  }, 2000)

  return {
    getSnapshot: async () => snapshot(),
    refresh: async () => snapshot(),
    apply: async (req: ApplyRequest): Promise<Result<ApplyResult>> => {
      const s = sims.find((x) => x.address === req.address)
      if (!s) return { ok: false, error: `Unknown device ${req.address}` }
      const values = { ...req.values, Codec: CODEC_BITS[req.codec] }
      Object.assign(s.next, values)
      s.connected = true
      await new Promise((r) => setTimeout(r, 500))
      listener?.(snapshot())
      for (const cb of eventListeners) {
        cb({
          kind: 'codec-changed',
          address: s.address,
          name: s.name,
          detail: CODECS[req.codec].label
        })
      }
      return { ok: true, data: { written: Object.keys(values), reconnected: req.reconnect, warnings: [] } }
    },
    elevate: async (): Promise<Result<void>> => ({
      ok: false,
      error: 'Elevation is not available in the browser preview.'
    }),
    reenable: async (): Promise<Result<void>> => ({
      ok: false,
      error: 'Re-enable is not available in the browser preview.'
    }),
    onSnapshot: (cb) => {
      listener = cb
      return () => {
        if (listener === cb) listener = null
      }
    },
    onDeviceEvent: (cb) => {
      eventListeners.add(cb)
      return () => eventListeners.delete(cb)
    }
  }
}
