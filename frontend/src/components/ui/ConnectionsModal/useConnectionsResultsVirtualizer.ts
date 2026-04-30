import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ToolkitStatus } from '@/api/connections'
import { getConnectionColumnCount, getConnectionGridClassName } from './useConnectionsCatalog'

const CONNECTION_CARD_ESTIMATED_HEIGHT_PX = 212
const CONNECTION_ROW_GAP_PX = 12
const CONNECTION_ROWS_OVERSCAN = 4
const RESIZE_SKELETON_ROW_COUNT = 6

interface UseConnectionsResultsVirtualizerOptions {
  isOpen: boolean
  filteredConnections: ToolkitStatus[]
  isCategorySidebarResizing: boolean
}

export function useConnectionsResultsVirtualizer({
  isOpen,
  filteredConnections,
  isCategorySidebarResizing,
}: UseConnectionsResultsVirtualizerOptions) {
  const resultsMeasureRef = useRef<HTMLDivElement>(null)
  const resultsScrollRef = useRef<HTMLDivElement>(null)
  const [resultsWidth, setResultsWidth] = useState(0)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const measuredElement = resultsMeasureRef.current
    if (!measuredElement || typeof ResizeObserver === 'undefined') {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      setResultsWidth(entry.contentRect.width)
    })

    resizeObserver.observe(measuredElement)
    return () => resizeObserver.disconnect()
  }, [isOpen])

  const columnCount = useMemo(() => getConnectionColumnCount(resultsWidth), [resultsWidth])
  const gridClassName = useMemo(() => getConnectionGridClassName(columnCount), [columnCount])

  const filteredConnectionRows = useMemo(() => {
    const rows: ToolkitStatus[][] = []

    for (let index = 0; index < filteredConnections.length; index += columnCount) {
      rows.push(filteredConnections.slice(index, index + columnCount))
    }

    return rows
  }, [filteredConnections, columnCount])

  const filteredConnectionRowKeys = useMemo(
    () => filteredConnectionRows.map((row) => row.map((connection) => connection.toolkit).join('|')),
    [filteredConnectionRows]
  )

  const getVirtualRowKey = useCallback(
    (index: number) => filteredConnectionRowKeys[index] ?? `row-${index}`,
    [filteredConnectionRowKeys]
  )

  const rowVirtualizer = useVirtualizer({
    count: filteredConnectionRows.length,
    enabled: isOpen && resultsWidth > 0 && !isCategorySidebarResizing,
    getScrollElement: () => resultsScrollRef.current,
    getItemKey: getVirtualRowKey,
    estimateSize: () => CONNECTION_CARD_ESTIMATED_HEIGHT_PX,
    gap: CONNECTION_ROW_GAP_PX,
    overscan: CONNECTION_ROWS_OVERSCAN,
  })

  const remeasureMountedRows = useCallback(() => {
    const scrollElement = resultsScrollRef.current
    if (!scrollElement) {
      return
    }

    const mountedRows = scrollElement.querySelectorAll<HTMLElement>('[data-connection-row="true"]')
    mountedRows.forEach((rowElement) => {
      rowVirtualizer.measureElement(rowElement)
    })
  }, [rowVirtualizer])

  useLayoutEffect(() => {
    if (!isOpen || resultsWidth <= 0 || isCategorySidebarResizing) {
      return
    }

    rowVirtualizer.measure()

    const frameId = window.requestAnimationFrame(() => {
      remeasureMountedRows()
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [columnCount, isCategorySidebarResizing, isOpen, remeasureMountedRows, resultsWidth, rowVirtualizer])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const scrollElement = resultsScrollRef.current
    if (scrollElement) {
      scrollElement.scrollTop = 0
    }

    rowVirtualizer.scrollToOffset(0)
    rowVirtualizer.measure()

    const frameId = window.requestAnimationFrame(() => {
      remeasureMountedRows()
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [isOpen, remeasureMountedRows, rowVirtualizer])

  const showVirtualizationSkeleton = filteredConnections.length > 0 && (isCategorySidebarResizing || resultsWidth <= 0)
  const resizeSkeletonCardIndexes = useMemo(
    () => Array.from({ length: Math.max(columnCount * RESIZE_SKELETON_ROW_COUNT, columnCount) }, (_, index) => index),
    [columnCount]
  )

  return {
    resultsMeasureRef,
    resultsScrollRef,
    gridClassName,
    filteredConnectionRows,
    rowVirtualizer,
    showVirtualizationSkeleton,
    resizeSkeletonCardIndexes,
  }
}
