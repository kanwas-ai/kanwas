import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export function EmptyWorkspace() {
  return (
    <div className="flex items-center justify-center h-full bg-gray-50">
      <div className="text-center max-w-md px-4">
        <div className="mb-6">
          <svg className="w-20 h-20 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-semibold text-gray-700 mb-2">No page selected</h2>
        <p className="text-gray-500 mb-6">Select or create a page from the sidebar to start editing</p>

        <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
          <LoadingSpinner size="sm" />
          <span>Loading workspace...</span>
        </div>
      </div>
    </div>
  )
}
