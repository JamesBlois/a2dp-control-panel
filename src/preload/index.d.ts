import type { A2dpApi } from '@shared/types'

declare global {
  interface Window {
    a2dp?: A2dpApi
  }
}

export {}
