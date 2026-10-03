import { describe, expect, it } from 'vitest'
import { deriveDeviceView } from '@main/backend/view'
import { applySettings } from '@main/backend/apply'
import type { DeviceState, DeviceView } from '@shared/types'
import type { DriverProvider } from '@main/providers/types'

function state(overrides: Partial<DeviceState> = {}): DeviceState {
  return {
    address: '0000340e224a88bb',
    name: 'Test Device',
    instanceId: 'BTHENUM\\{...}\\0&340E224A88BB_C00000000',
    capability: { Codec: 0x03, SbcChannelMode: 15, SbcSamplingFrequency: 15 },
    current: {
      Codec: 2,
      AacChannelMode: 4,
      AacSamplingFrequency: 8,
      AacBitrate: 0,
      Opened: 1,
      Bitrate: 256000,
      Delay: 1700,
      ScoActive: 0,
      Error: 0
    },
    next: { Codec: 2, AacChannelMode: 4, AacSamplingFrequency: 8, AacBitrate: 0 },
    ...overrides
  }
}

function view(overrides: Partial<DeviceView> = {}): DeviceView {
  return { ...deriveDeviceView(state()), ...overrides }
}

/** Minimal fake provider that records writes; no mocks of the code under test. */
function recordingProvider(): { provider: DriverProvider; writes: Record<string, number>[] } {
  const writes: Record<string, number>[] = []
  const provider: DriverProvider = {
    kind: 'mock',
    writable: true,
    status: async () => ({
      isWindows: false,
      isAdmin: true,
      driverInstalled: true,
      serviceInstalled: true,
      serviceRunning: true,
      mock: true,
      message: null
    }),
    readDevices: async () => [],
    writeNext: async (_address, values) => {
      writes.push(values)
      return Object.keys(values)
    },
    reconnect: async () => {}
  }
  return { provider, writes }
}

describe('deriveDeviceView', () => {
  it('derives connected state, codec and support from registry values', () => {
    const v = deriveDeviceView(state())
    expect(v.connected).toBe(true)
    expect(v.currentCodec).toBe('AAC')
    expect(v.supports).toEqual(['SBC', 'AAC'])
    expect(v.currentBitrate).toBe(256000)
    expect(v.pendingChanges).toBe(false)
  })

  it('flags a pending change when Next differs from Current', () => {
    const v = deriveDeviceView(
      state({
        current: { Codec: 1, Opened: 1, SbcChannelMode: 1, SbcMaximumBitpool: 53 },
        next: { Codec: 2, AacChannelMode: 4, AacSamplingFrequency: 8, AacBitrate: 0 }
      })
    )
    expect(v.pendingChanges).toBe(true)
  })
})

describe('applySettings validation', () => {
  it('writes a single codec bit plus validated parameters', async () => {
    const { provider, writes } = recordingProvider()
    const result = await applySettings(provider, view(), {
      address: '0000340e224a88bb',
      codec: 'AAC',
      values: { AacChannelMode: 4, AacSamplingFrequency: 8, AacBitrate: 256000 },
      reconnect: false
    })
    expect(writes).toHaveLength(1)
    expect(writes[0].Codec).toBe(2)
    expect(writes[0].AacChannelMode).toBe(4)
    expect(writes[0].AacBitrate).toBe(256000)
    expect(result.reconnected).toBe(false)
  })

  it('rejects a codec the device does not advertise', async () => {
    const { provider } = recordingProvider()
    await expect(
      applySettings(provider, view(), {
        address: '0000340e224a88bb',
        codec: 'LDAC',
        values: {},
        reconnect: false
      })
    ).rejects.toThrow(/not advertised/)
  })

  it('drops unadvertised select options and reports a warning', async () => {
    const { provider, writes } = recordingProvider()
    // Capability advertises only Stereo (4) for AAC channel mode.
    const device = view({ capability: { Codec: 0x02, AacChannelMode: 4 } })
    const result = await applySettings(provider, device, {
      address: '0000340e224a88bb',
      codec: 'AAC',
      values: { AacChannelMode: 8 },
      reconnect: false
    })
    expect(writes[0].AacChannelMode).toBe(4)
    expect(result.warnings.join(' ')).toMatch(/not advertised/)
  })

  it('clamps out-of-range numeric values', async () => {
    const { provider, writes } = recordingProvider()
    const result = await applySettings(provider, view(), {
      address: '0000340e224a88bb',
      codec: 'AAC',
      values: { AacBitrate: 9_000_000 },
      reconnect: false
    })
    expect(writes[0].AacBitrate).toBe(320000)
    expect(result.warnings.join(' ')).toMatch(/clamped/)
  })

  it('warns instead of failing when the instance ID is missing', async () => {
    const { provider } = recordingProvider()
    const result = await applySettings(provider, view({ instanceId: null }), {
      address: '0000340e224a88bb',
      codec: 'AAC',
      values: {},
      reconnect: true
    })
    expect(result.reconnected).toBe(false)
    expect(result.warnings.join(' ')).toMatch(/instance ID/)
  })
})
