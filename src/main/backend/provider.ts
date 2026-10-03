import { MockProvider } from '../providers/mock'
import { PowerShellProvider } from '../providers/powershell'
import type { DriverProvider } from '../providers/types'

/**
 * Chooses the backend. The real registry backend only makes sense on Windows;
 * everywhere else (and when A2DP_FORCE_MOCK=1) the simulated provider is used
 * so the app still launches and the UI can be developed.
 */
export function createProvider(): DriverProvider {
  const forceMock = process.env.A2DP_FORCE_MOCK === '1'
  if (forceMock) return new MockProvider()
  if (process.platform === 'win32') return new PowerShellProvider()
  return new MockProvider()
}
