import { useMemo } from 'react'
import type { ToolkitStatus } from '@/api/connections'
import { ConnectionItem } from './ConnectionItem'
import { useConnectionsResultsVirtualizer } from './useConnectionsResultsVirtualizer'

interface ConnectionsResultsPanelProps {
  isOpen: boolean
  isLoading: boolean
  filteredConnections: ToolkitStatus[]
  isCategorySidebarResizing: boolean
  activeAttemptToolkit: string | null
  isConnectionAttemptInProgress: boolean
  highlightToolkit: string | null
  onConnectToolkit: (toolkit: string) => Promise<void> | void
  onDisconnect: (connectedAccountId: string) => Promise<void> | void
}

export function ConnectionsResultsPanel({
  isOpen,
  isLoading,
  filteredConnections,
  isCategorySidebarResizing,
  activeAttemptToolkit,
  isConnectionAttemptInProgress,
  highlightToolkit,
  onConnectToolkit,
  onDisconnect,
}: ConnectionsResultsPanelProps) {
  // Find the first toolkit whose display name starts with the highlight search term
  const highlightedToolkitId = useMemo(() => {
    if (!highlightToolkit || filteredConnections.length === 0) return null
    const search = highlightToolkit.toLowerCase()
    const match = filteredConnections.find((c) => c.displayName.toLowerCase().startsWith(search))
    return match?.toolkit ?? null
  }, [highlightToolkit, filteredConnections])

  const {
    resultsMeasureRef,
    resultsScrollRef,
    gridClassName,
    filteredConnectionRows,
    rowVirtualizer,
    showVirtualizationSkeleton,
    resizeSkeletonCardIndexes,
  } = useConnectionsResultsVirtualizer({
    isOpen,
    filteredConnections,
    isCategorySidebarResizing,
  })

  return (
    <div ref={resultsMeasureRef} className="flex-1 min-h-0" aria-busy={isLoading || showVirtualizationSkeleton}>
      {isLoading ? (
        <div className="flex flex-1 h-full items-center justify-center py-12">
          <i className="fa-solid fa-spinner fa-spin text-xl text-foreground-muted" />
        </div>
      ) : (
        <div ref={resultsScrollRef} className="flex-1 h-full overflow-y-auto min-h-[320px] px-5 lg:px-6 py-4">
          {showVirtualizationSkeleton ? (
            <div className={`grid ${gridClassName} gap-3 items-stretch`} aria-hidden="true">
              {resizeSkeletonCardIndexes.map((index) => (
                <div key={index} className="h-[212px] animate-pulse rounded-xl border border-outline/60 bg-editor/45" />
              ))}
            </div>
          ) : filteredConnections.length > 0 ? (
            <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const rowConnections = filteredConnectionRows[virtualRow.index]

                if (!rowConnections) {
                  return null
                }

                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    data-connection-row="true"
                    className={`absolute left-0 top-0 w-full grid ${gridClassName} gap-x-3 items-stretch`}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {rowConnections.map((connection) => {
                      const isInteractionDisabled =
                        isConnectionAttemptInProgress && activeAttemptToolkit !== connection.toolkit

                      return (
                        <ConnectionItem
                          key={connection.toolkit}
                          displayName={connection.displayName}
                          logo={connection.logo}
                          description={connection.description}
                          categories={connection.categories}
                          isNoAuth={connection.isNoAuth}
                          isConnected={connection.isConnected}
                          isConnecting={activeAttemptToolkit === connection.toolkit}
                          isInteractionDisabled={isInteractionDisabled}
                          isHighlighted={highlightedToolkitId === connection.toolkit}
                          onConnect={() => {
                            void onConnectToolkit(connection.toolkit)
                          }}
                          onDisconnect={() => {
                            if (connection.connectedAccountId) {
                              void onDisconnect(connection.connectedAccountId)
                            }
                          }}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center py-12 text-foreground-muted">
              <i className="fa-solid fa-plug text-3xl mb-3 opacity-50" />
              <p className="text-sm">No matching integrations</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
