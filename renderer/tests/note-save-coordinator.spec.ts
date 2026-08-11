import { describe, expect, it, vi } from 'vitest'
import { noteSaveCoordinator } from '@/lib/noteSaveCoordinator'

describe('note save coordinator', () => {
  it('awaits every registered editor flusher', async () => {
    const first = vi.fn(async () => undefined)
    const second = vi.fn(async () => undefined)
    const unregisterFirst = noteSaveCoordinator.register(first)
    const unregisterSecond = noteSaveCoordinator.register(second)

    await noteSaveCoordinator.flushAll()

    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    unregisterFirst()
    unregisterSecond()
  })

  it('does not flush an editor after it unregisters', async () => {
    const flush = vi.fn(async () => undefined)
    noteSaveCoordinator.register(flush)()
    await noteSaveCoordinator.flushAll()
    expect(flush).not.toHaveBeenCalled()
  })
})
