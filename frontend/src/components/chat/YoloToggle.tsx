import { useChat } from '@/providers/chat'
import { useSetYoloMode } from '@/providers/chat/hooks'
import { useSnapshot } from 'valtio'

export function YoloToggle() {
  const { state, derived } = useChat()
  const snapshot = useSnapshot(state)
  const derivedSnapshot = useSnapshot(derived)
  const setYoloMode = useSetYoloMode()

  const handleToggle = () => {
    setYoloMode(!snapshot.yoloMode)
  }

  // Disable toggle when agent is processing
  const isDisabled = derivedSnapshot.isProcessing

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="yolo-toggle"
        className="text-xs text-foreground-muted select-none"
        title="Skip approval prompts for delete operations"
      >
        YOLO
      </label>
      <button
        type="button"
        role="switch"
        aria-checked={snapshot.yoloMode}
        onClick={handleToggle}
        disabled={isDisabled}
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-focused focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
          snapshot.yoloMode ? 'bg-green-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
            snapshot.yoloMode ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}
