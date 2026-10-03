/**
 * Constant registry paths and value-name lists for the AltA2DP driver.
 * Kept in one place so the PowerShell provider, the mock provider and any
 * future native provider agree on the schema.
 */

export const SERVICE_KEY = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\AltA2DP'
export const DEVICES_KEY = `${SERVICE_KEY}\\Parameters\\Devices`
export const CAPABILITY_KEY = `${DEVICES_KEY}\\Capability`
export const CURRENT_KEY = `${DEVICES_KEY}\\Current`
export const NEXT_KEY = `${DEVICES_KEY}\\Next`

/** Values present on every subkey (Capability / Current / Next). */
export const COMMON_VALUES = [
  'Codec',
  'SbcChannelMode',
  'SbcSamplingFrequency',
  'SbcAllocationMethod',
  'SbcSubbands',
  'SbcBlockLength',
  'SbcMinimumBitpool',
  'SbcMaximumBitpool',
  'AbrEnable',
  'AacChannelMode',
  'AacSamplingFrequency',
  'AacBitrate',
  'AacPeakBitrate',
  'LdacChannelMode',
  'LdacSamplingFrequency',
  'LdacSampleFormat',
  'LdacEqmid',
  'AptxChannelMode',
  'AptxSamplingFrequency',
  'AptxHdChannelMode',
  'AptxHdSamplingFrequency',
  'AptxHdSampleFormat',
  'AptxLlChannelMode',
  'AptxLlSamplingFrequency'
] as const

/** Additional values only present on the Current subkey. */
export const CURRENT_EXTRA_VALUES = ['Opened', 'Bitrate', 'ScoActive', 'Delay', 'Error'] as const

/** Additional values only present on the Next subkey. */
export const NEXT_EXTRA_VALUES = ['VolumeLevel'] as const

export const READ_VALUES = [...COMMON_VALUES, ...CURRENT_EXTRA_VALUES, ...NEXT_EXTRA_VALUES]

/**
 * Registry value names that are safe for the app to write. Anything not on this
 * allowlist is rejected, which prevents a compromised renderer from writing
 * arbitrary values into a kernel driver's configuration key.
 */
export const WRITABLE_VALUES: ReadonlySet<string> = new Set([
  ...COMMON_VALUES,
  ...NEXT_EXTRA_VALUES
])

/** PnP instance-ID match for the A2DP audio sink interface. */
export const BTHENUM_A2DP_PATTERN = '*BTHENUM*110b*'
