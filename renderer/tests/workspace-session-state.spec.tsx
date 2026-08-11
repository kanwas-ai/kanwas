import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceProvider, useWorkspace } from '@/providers/workspace'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type SessionSnapshot = Pick<ReturnType<typeof useWorkspace>, 'sessionError' | 'sessionState'>
type ProviderEvent = 'connection-error' | 'reload' | 'status' | 'sync'
type ProviderListener = (...args: never[]) => void

interface MockProvider {
  connected: boolean
  synced: boolean
  emitTest(event: ProviderEvent, ...args: unknown[]): void
}

const providerHarness = vi.hoisted(() => ({ instances: [] as unknown[] }))

vi.mock('shared/workspace-provider', () => {
  class MockWorkspaceSocketProvider {
    connected = false
    synced = false
    private readonly listeners = new Map<string, Set<(...args: never[]) => void>>()

    constructor() {
      providerHarness.instances.push(this)
    }

    connect() {}
    destroy() {}

    on(event: string, listener: (...args: never[]) => void) {
      const listeners = this.listeners.get(event) ?? new Set()
      listeners.add(listener)
      this.listeners.set(event, listeners)
    }

    off(event: string, listener: (...args: never[]) => void) {
      this.listeners.get(event)?.delete(listener)
    }

    emitTest(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...(args as never[]))
      }
    }
  }

  return { WorkspaceSocketProvider: MockWorkspaceSocketProvider }
})

vi.mock('@/providers/workspace/useYjsSocketToken', () => ({
  useYjsSocketToken: () => ({
    error: null,
    getToken: () => 'local-workspace-token',
    isReady: true,
  }),
}))

vi.mock('@/api/client', () => ({ baseURL: 'http://127.0.0.1:4300' }))

function SessionProbe({ onChange }: { onChange: (snapshot: SessionSnapshot) => void }) {
  const { sessionError, sessionState } = useWorkspace()

  useEffect(() => {
    onChange({ sessionError, sessionState })
  }, [onChange, sessionError, sessionState])

  return null
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  vi.useFakeTimers()
  providerHarness.instances.length = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
  vi.useRealTimers()
})

async function renderSession(): Promise<{ provider: MockProvider; snapshots: SessionSnapshot[] }> {
  const snapshots: SessionSnapshot[] = []

  await act(async () => {
    root?.render(
      createElement(
        WorkspaceProvider,
        { workspaceId: 'workspace-test' },
        createElement(SessionProbe, {
          onChange: (snapshot: SessionSnapshot) => snapshots.push(snapshot),
        })
      )
    )
  })

  const provider = providerHarness.instances[0] as MockProvider | undefined
  if (!provider) {
    throw new Error('Workspace provider was not created')
  }
  return { provider, snapshots }
}

function markReady(provider: MockProvider) {
  provider.connected = true
  provider.synced = true
  provider.emitTest('sync', true)
}

function markDisconnected(provider: MockProvider) {
  provider.connected = false
  provider.synced = false
  provider.emitTest('sync', false)
  provider.emitTest('status')
}

describe('local workspace session state', () => {
  it('recovers a short local transport interruption without exposing an error', async () => {
    const { provider, snapshots } = await renderSession()

    act(() => markReady(provider))
    expect(snapshots.at(-1)).toEqual({ sessionError: null, sessionState: 'ready' })

    act(() => markDisconnected(provider))
    expect(snapshots.at(-1)).toEqual({ sessionError: null, sessionState: 'recovering' })

    act(() => vi.advanceTimersByTime(4_999))
    expect(snapshots.at(-1)).toEqual({ sessionError: null, sessionState: 'recovering' })

    act(() => markReady(provider))
    act(() => vi.advanceTimersByTime(5_000))
    expect(snapshots.at(-1)).toEqual({ sessionError: null, sessionState: 'ready' })
  })

  it('interrupts after five seconds and clears the failure if the channel recovers', async () => {
    const { provider, snapshots } = await renderSession()

    act(() => markReady(provider))
    act(() => markDisconnected(provider))
    act(() => vi.advanceTimersByTime(5_000))

    expect(snapshots.at(-1)).toEqual({
      sessionError: 'Local workspace session was interrupted. Reload Workspace to continue safely.',
      sessionState: 'interrupted',
    })

    act(() => markReady(provider))
    expect(snapshots.at(-1)).toEqual({ sessionError: null, sessionState: 'ready' })
  })

  it('turns a reload-consistency signal into a local interruption without reloading automatically', async () => {
    const { provider, snapshots } = await renderSession()

    act(() => markReady(provider))
    act(() => provider.emitTest('reload', { reason: 'document_replaced' }))

    expect(snapshots.at(-1)).toEqual({
      sessionError: 'Local workspace session was interrupted. Reload Workspace to continue safely.',
      sessionState: 'interrupted',
    })

    act(() => markReady(provider))
    expect(snapshots.at(-1)).toEqual({
      sessionError: 'Local workspace session was interrupted. Reload Workspace to continue safely.',
      sessionState: 'interrupted',
    })
  })
})
