import { createPortal } from 'react-dom'

interface DeleteConfirmationProps {
  onDelete: () => void
  onCancel: () => void
}

export const DeleteConfirmation = ({ onDelete, onCancel }: DeleteConfirmationProps) => {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-6 animate-[scaleIn_0.2s_ease-out] border-2 border-outline">
        <span className="text-md font-bold text-gray-900 dark:text-gray-100">Sure want to delete?</span>
        <button
          onClick={onDelete}
          className="text-md font-medium text-red-600 dark:text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors cursor-pointer"
        >
          Delete
        </button>
        <button
          onClick={onCancel}
          className="text-md p-6 py-2 font-medium text-white bg-gray-900 dark:bg-gray-700 rounded-md hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors cursor-pointer"
        >
          No
        </button>
      </div>
    </div>,
    document.body
  )
}
