import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { parse } from 'papaparse'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnSizingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

interface CsvViewerProps {
  signedUrl: string
  maxRows?: number
}

export const CsvViewer = memo(function CsvViewer({ signedUrl, maxRows = 10000 }: CsvViewerProps) {
  const [rawData, setRawData] = useState<string[][]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [truncated, setTruncated] = useState(false)
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})
  const parentRef = useRef<HTMLDivElement>(null)

  // Fetch and parse CSV
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(signedUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then((text) => {
        if (cancelled) return

        const result = parse(text, {
          header: false,
          skipEmptyLines: 'greedy',
          delimiter: '', // auto-detect
          preview: maxRows + 1,
        })

        const rows = result.data as string[][]
        if (rows.length > maxRows) {
          setRawData(rows.slice(0, maxRows))
          setTruncated(true)
        } else {
          setRawData(rows)
          setTruncated(false)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [signedUrl, maxRows])

  // Build columns from header row
  const columns = useMemo(() => {
    if (rawData.length === 0) return []
    const headers = rawData[0]
    const columnHelper = createColumnHelper<string[]>()

    return headers.map((header, index) =>
      columnHelper.accessor((row) => row[index] ?? '', {
        id: `col_${index}`,
        header: () => header || `Column ${index + 1}`,
        size: 120,
        minSize: 60,
        maxSize: 500,
        cell: (info) => info.getValue(),
      })
    )
  }, [rawData])

  // Data rows (skip header)
  const data = useMemo(() => rawData.slice(1), [rawData])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
  })

  const { rows } = table.getRowModel()

  // Virtual rows for performance
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  })

  if (loading) return <CsvSkeleton />
  if (error) return <div className="p-4 text-status-error text-sm">Failed to load CSV: {error}</div>
  if (rawData.length === 0) return <div className="p-4 text-foreground-muted text-sm">Empty CSV</div>

  // Total table width for horizontal scroll
  const tableWidth = table.getTotalSize()

  return (
    <div className="select-auto">
      {/* Scrollable container - explicit height needed for virtualization */}
      {/* nowheel class prevents ReactFlow from capturing wheel events */}
      <div ref={parentRef} className="overflow-auto scrollbar-thin nowheel" style={{ height: 320 }}>
        {/* Inner wrapper ensures horizontal scroll */}
        <div style={{ minWidth: tableWidth }}>
          {/* Header row */}
          <div className="sticky top-0 z-10 bg-block-highlight flex border-b border-outline">
            {table.getHeaderGroups()[0]?.headers.map((header) => (
              <div
                key={header.id}
                className="relative px-4 py-3 text-sm text-foreground/70 whitespace-nowrap truncate border-r border-outline/30 last:border-r-0"
                style={{ width: header.getSize() }}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
                {/* Resize handle */}
                {header.column.getCanResize() && (
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none
                    ${
                      table.getState().columnSizingInfo.isResizingColumn === header.id
                        ? 'bg-primary'
                        : 'bg-transparent hover:bg-foreground/20'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Virtualized body - uses absolute positioning */}
          <div
            className="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            role="grid"
            aria-rowcount={rows.length}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <div
                  key={row.id}
                  className="absolute left-0 right-0 flex hover:bg-block-hover transition-colors"
                  style={{
                    top: virtualRow.start,
                    height: virtualRow.size,
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div
                      key={cell.id}
                      className="px-3 py-1 text-sm text-foreground truncate border-r border-b border-outline/20 last:border-r-0"
                      style={{ width: cell.column.getSize() }}
                      title={cell.getValue() as string}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {truncated && (
        <div className="px-3 py-1 text-center text-xs text-foreground-muted border-t border-outline">
          Showing first {maxRows.toLocaleString()} rows
        </div>
      )}
    </div>
  )
})

function CsvSkeleton() {
  return (
    <div className="p-4 animate-pulse">
      <div className="flex gap-4 mb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 bg-block-highlight rounded w-24" />
        ))}
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-4 mb-2">
          {[1, 2, 3, 4].map((j) => (
            <div key={j} className="h-3 bg-outline/50 rounded w-24" />
          ))}
        </div>
      ))}
    </div>
  )
}
