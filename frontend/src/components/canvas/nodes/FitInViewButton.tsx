import { useFitNodeInView } from '../hooks'

interface FitInViewButtonProps {
  nodeId: string
}

export default function FitInViewButton({ nodeId }: FitInViewButtonProps) {
  const fitNodeInView = useFitNodeInView()

  return (
    <button
      onClick={() => fitNodeInView(nodeId)}
      className="absolute top-2 right-2 z-10
                 w-[36px] h-[36px] bg-block-highlight text-foreground hover:bg-block-highlight
                 rounded-full transition-all
                 duration-200 flex items-center justify-center cursor-pointer
                 active:scale-95 opacity-80 hover:opacity-100"
      aria-label="Fit in view"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="pointer-events-none"
      >
        <path
          d="M9 3H5C3.89543 3 3 3.89543 3 5V9M15 3H19C20.1046 3 21 3.89543 21 5V9M9 21H5C3.89543 21 3 20.1046 3 19V15M15 21H19C20.1046 21 21 20.1046 21 19V15"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
