import { describe, expect, it } from 'vitest'
import {
  CODEC_BITS,
  codecLabel,
  decodeCodecMask,
  formatAddress,
  formatBitrate,
  formatDelay,
  isCodecSupported,
  supportedCodecs,
  supportedOptions,
  CODECS,
  rangeMax
} from '@shared/codec'

describe('codec bitmask decoding', () => {
  it('decodes the documented bit values', () => {
    expect(CODEC_BITS).toEqual({ SBC: 1, AAC: 2, LDAC: 4, APTX: 8, APTX_HD: 16, APTX_LL: 32 })
  })

  it('decodes AirPods capability 0x03 as SBC + AAC', () => {
    expect(decodeCodecMask(0x03)).toEqual(['SBC', 'AAC'])
    expect(codecLabel(0x03)).toBe('SBC + AAC')
  })

  it('decodes a 4-codec device capability 0x2b', () => {
    expect(decodeCodecMask(0x2b)).toEqual(['SBC', 'AAC', 'APTX', 'APTX_LL'])
  })

  it('decodes single-bit selections', () => {
    expect(decodeCodecMask(8)).toEqual(['APTX'])
    expect(decodeCodecMask(32)).toEqual(['APTX_LL'])
    expect(decodeCodecMask(0)).toEqual([])
    expect(codecLabel(0)).toBe('None')
  })
})

describe('codec support detection', () => {
  it('uses the Codec bitmask when present', () => {
    const cap = { Codec: 0x03 }
    expect(isCodecSupported(cap, 'SBC')).toBe(true)
    expect(isCodecSupported(cap, 'AAC')).toBe(true)
    expect(isCodecSupported(cap, 'LDAC')).toBe(false)
  })

  it('falls back to a non-zero channel mode when the bitmask is incomplete', () => {
    const cap = { Codec: 0, LdacChannelMode: 1 }
    expect(isCodecSupported(cap, 'LDAC')).toBe(true)
    expect(isCodecSupported(cap, 'APTX')).toBe(false)
  })

  it('lists supported codecs in canonical order', () => {
    expect(supportedCodecs({ Codec: 0x2b })).toEqual(['SBC', 'AAC', 'APTX', 'APTX_LL'])
  })
})

describe('option filtering', () => {
  it('intersects select options with the capability bitmask', () => {
    const field = CODECS.SBC.fields[0] // SbcChannelMode
    const options = supportedOptions(field, { SbcChannelMode: 0b0011 }) // Joint Stereo | Stereo
    expect(options.map((o) => o.value)).toEqual([1, 2])
  })

  it('keeps all options when the capability value is unadvertised (0)', () => {
    const field = CODECS.SBC.fields[0]
    expect(supportedOptions(field, { SbcChannelMode: 0 })).toHaveLength(4)
  })

  it('never filters plain enums, so LDAC quality mode 0 stays selectable', () => {
    const field = CODECS.LDAC.fields.find((f) => f.key === 'LdacEqmid')!
    const options = supportedOptions(field, { LdacEqmid: 0 })
    expect(options.map((o) => o.value)).toEqual([0, 1, 2, 3])
  })
})

describe('range clamping', () => {
  it('uses the schema max when no capability max is advertised', () => {
    const field = CODECS.SBC.fields.find((f) => f.key === 'SbcMaximumBitpool')!
    expect(rangeMax(field, {})).toBe(250)
  })

  it('clamps to the device-advertised AAC peak bitrate', () => {
    const field = CODECS.AAC.fields.find((f) => f.key === 'AacBitrate')!
    expect(rangeMax(field, { AacPeakBitrate: 320000 })).toBe(320000)
    expect(rangeMax(field, { AacPeakBitrate: 999999 })).toBe(320000) // schema ceiling
  })
})

describe('formatting', () => {
  it('formats bitrates', () => {
    expect(formatBitrate(256000)).toBe('256 kbps')
    expect(formatBitrate(990000)).toBe('990 kbps')
    expect(formatBitrate(1200000)).toBe('1.20 Mbps')
    expect(formatBitrate(0)).toBe('—')
  })

  it('converts delay units (100ns) to milliseconds', () => {
    expect(formatDelay(1700)).toBe('170.0 ms')
    expect(formatDelay(500)).toBe('50.0 ms')
  })

  it('formats a 16-char BT address', () => {
    expect(formatAddress('0000340e224a88bb')).toBe('34:0E:22:4A:88:BB')
  })
})
