import { memo } from 'react'
import { useReactFlow } from '@xyflow/react'

export default memo(function ZoomResetButton() {
  const { zoomTo } = useReactFlow()

  return (
    <button
      onClick={() => zoomTo(1, { duration: 200 })}
      className="group h-[30px] w-[30px] flex items-center justify-center rounded-full transition-all duration-200
                 hover:scale-110 active:scale-95 cursor-pointer text-foreground/50 hover:text-foreground"
      aria-label="Reset zoom to 100%"
    >
      <i className="fa-regular fa-magnifying-glass text-[14px] transition-colors"></i>
    </button>
  )
})
