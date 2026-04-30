import { useCallback, useEffect, useRef } from 'react'
import type { CanvasItem } from 'shared'
import { AUDIT_TOUCH_DEBOUNCE_MS, touchNodeAndOwnerCanvasAudit } from '@/lib/workspaceAudit'

interface UseDebouncedAuditTouchOptions {
  root: CanvasItem | undefined
  nodeId: string
  actor: string | undefined
  debounceMs?: number
  transact?: (fn: () => boolean) => boolean
  runWithOperationId?: (operationId: string, fn: () => boolean) => boolean
  runWithoutUndoTracking?: (fn: () => boolean, shouldSuppress: (result: boolean) => boolean) => boolean
}

interface AuditTouchTarget {
  root: CanvasItem | undefined
  nodeId: string
  actor: string | undefined
  operationId: string | null
}

export function useDebouncedAuditTouch({
  root,
  nodeId,
  actor,
  debounceMs = AUDIT_TOUCH_DEBOUNCE_MS,
  transact,
  runWithOperationId,
  runWithoutUndoTracking,
}: UseDebouncedAuditTouchOptions) {
  const latestTargetRef = useRef<AuditTouchTarget>({ root, nodeId, actor, operationId: null })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    latestTargetRef.current = { ...latestTargetRef.current, root, nodeId, actor }
  }, [root, nodeId, actor])

  const touchNow = useCallback(() => {
    const target = latestTargetRef.current
    if (!target.root) {
      return false
    }

    const applyTouch = () =>
      touchNodeAndOwnerCanvasAudit(target.root!, target.nodeId, target.actor, new Date().toISOString())
    const applyTouchInTransaction = () => (transact ? transact(applyTouch) : applyTouch())

    if (target.operationId && runWithOperationId) {
      return runWithOperationId(target.operationId, applyTouchInTransaction)
    }

    if (runWithoutUndoTracking) {
      return runWithoutUndoTracking(applyTouchInTransaction, (didChange) => didChange === true)
    }

    return applyTouchInTransaction()
  }, [runWithOperationId, runWithoutUndoTracking, transact])

  const flushTouch = useCallback(() => {
    if (!timeoutRef.current) {
      return
    }

    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    touchNow()
  }, [touchNow])

  const cancelTouch = useCallback(() => {
    if (!timeoutRef.current) {
      return
    }

    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }, [])

  const scheduleTouch = useCallback(
    (operationId: string | null) => {
      if (!latestTargetRef.current.root) {
        return
      }

      latestTargetRef.current = {
        ...latestTargetRef.current,
        operationId,
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        touchNow()
      }, debounceMs)
    },
    [debounceMs, touchNow]
  )

  useEffect(() => {
    return () => {
      flushTouch()
    }
  }, [flushTouch])

  return {
    scheduleTouch,
    flushTouch,
    cancelTouch,
  }
}
