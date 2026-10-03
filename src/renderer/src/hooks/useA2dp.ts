import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  A2dpApi,
  ApplyRequest,
  ApplyResult,
  AppSnapshot,
  DeviceEvent,
  Result
} from '@shared/types'
import { createBrowserMockApi } from '../lib/mockApi'

/** Resolve the preload bridge, falling back to the in-browser simulation. */
function resolveApi(): A2dpApi {
  if (typeof window !== 'undefined' && window.a2dp) return window.a2dp
  return createBrowserMockApi()
}

export interface Toast {
  id: number
  kind: 'success' | 'info' | 'error' | 'warn'
  title: string
  detail?: string
}

export function useA2dp(): {
  snapshot: AppSnapshot | null
  api: A2dpApi
  busy: boolean
  toasts: Toast[]
  dismissToast: (id: number) => void
  pushToast: (t: Omit<Toast, 'id'>) => void
  refresh: () => Promise<void>
  apply: (req: ApplyRequest) => Promise<Result<ApplyResult>>
  elevate: () => Promise<Result<void>>
  reenable: (address: string) => Promise<Result<void>>
} {
  const api = useMemo(resolveApi, [])
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const pushToast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++toastId.current
      setToasts((prev) => [...prev.slice(-4), { ...t, id }])
      const timer = setTimeout(() => dismissToast(id), 5200)
      timers.current.set(id, timer)
    },
    [dismissToast]
  )

  useEffect(() => {
    let alive = true
    void api.getSnapshot().then((s) => {
      if (alive) setSnapshot(s)
    })
    const offSnapshot = api.onSnapshot((s) => setSnapshot(s))
    const offEvent = api.onDeviceEvent((e: DeviceEvent) => {
      if (e.kind === 'connected') {
        pushToast({ kind: 'success', title: `${e.name} connected`, detail: 'Device is ready.' })
      } else if (e.kind === 'disconnected') {
        pushToast({ kind: 'info', title: `${e.name} disconnected` })
      } else if (e.kind === 'codec-changed') {
        pushToast({ kind: 'info', title: `${e.name}: codec changed`, detail: e.detail })
      } else if (e.kind === 'error') {
        pushToast({ kind: 'error', title: 'Backend error', detail: e.detail })
      }
    })
    return () => {
      alive = false
      offSnapshot()
      offEvent()
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
    }
  }, [api, pushToast])

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      setSnapshot(await api.refresh())
    } finally {
      setBusy(false)
    }
  }, [api])

  const apply = useCallback(
    async (req: ApplyRequest) => {
      setBusy(true)
      try {
        const result = await api.apply(req)
        if (result.ok) {
          pushToast({
            kind: 'success',
            title: 'Settings applied',
            detail: result.data.reconnected ? 'Device reconnected with the new codec.' : 'Written to Next.'
          })
          for (const w of result.data.warnings) pushToast({ kind: 'warn', title: 'Adjusted', detail: w })
        } else {
          pushToast({ kind: 'error', title: 'Apply failed', detail: result.error })
        }
        return result
      } finally {
        setBusy(false)
      }
    },
    [api, pushToast]
  )

  const elevate = useCallback(async () => {
    const result = await api.elevate()
    if (!result.ok) pushToast({ kind: 'error', title: 'Elevation failed', detail: result.error })
    return result
  }, [api, pushToast])

  const reenable = useCallback(
    async (address: string) => {
      setBusy(true)
      try {
        const result = await api.reenable(address)
        if (result.ok) {
          pushToast({ kind: 'success', title: 'Device re-enabled' })
          setSnapshot(await api.refresh())
        } else {
          pushToast({ kind: 'error', title: 'Re-enable failed', detail: result.error })
        }
        return result
      } finally {
        setBusy(false)
      }
    },
    [api, pushToast]
  )

  return { snapshot, api, busy, toasts, dismissToast, pushToast, refresh, apply, elevate, reenable }
}
