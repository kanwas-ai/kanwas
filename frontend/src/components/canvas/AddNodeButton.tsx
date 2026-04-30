import { memo, useEffect } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import type { CanvasItem } from 'shared'
import { AddLinkModal } from './AddLinkModal'
import { GhostCursor } from './GhostCursor'
import { useToolbarPlacement } from './useToolbarPlacement'
import { PRIMARY_TOOLS, MORE_TOOLS } from './addNodeToolbar'

const TOOLTIP_CLASS =
  'z-50 pointer-events-none bg-white dark:bg-editor border border-[var(--card-border)] rounded-lg px-2 py-1 text-xs font-medium text-foreground shadow-sm animate-in fade-in-0 zoom-in-95 duration-100'

interface AddNodeButtonProps {
  canvas: CanvasItem
  onHoveredSectionChange?: (sectionId: string | null) => void
  onSectionContentChange?: (sectionId: string) => void
}

export const AddNodeButton = memo(function AddNodeButton({
  canvas,
  onHoveredSectionChange,
  onSectionContentChange,
}: AddNodeButtonProps) {
  const {
    armedTool,
    isMoreOpen,
    isLinkModalOpen,
    hoveredSectionId,
    setIsMoreOpen,
    showGhostCursor,
    cursorRef,
    toolbarRef,
    moreMenuRef,
    fileInputRef,
    genericFileInputRef,
    audioFileInputRef,
    handleToolClick,
    handleToolDoubleClick,
    handleToolMouseDown,
    handleImageFileChange,
    handleGenericFileChange,
    handleAudioFileChange,
    handleLinkSubmit,
    handleLinkModalClose,
    imageAccept,
    fileAccept,
    audioAccept,
  } = useToolbarPlacement(canvas, onSectionContentChange)

  useEffect(() => {
    onHoveredSectionChange?.(hoveredSectionId)
  }, [hoveredSectionId, onHoveredSectionChange])

  useEffect(() => () => onHoveredSectionChange?.(null), [onHoveredSectionChange])

  const centerX = 'calc(50% - var(--sidebar-width, 0px) / 2)'

  return (
    <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept={imageAccept} onChange={handleImageFileChange} className="hidden" />
      <input
        ref={genericFileInputRef}
        type="file"
        accept={fileAccept}
        onChange={handleGenericFileChange}
        className="hidden"
      />
      <input
        ref={audioFileInputRef}
        type="file"
        accept={audioAccept}
        onChange={handleAudioFileChange}
        className="hidden"
      />

      <GhostCursor ref={cursorRef} visible={showGhostCursor} />

      <div
        ref={toolbarRef}
        className="canvas-toolbar-pill absolute bottom-[18px] z-10 flex items-center p-1 rounded-[56px]"
        style={{ left: centerX, transform: 'translateX(-50%)' }}
      >
        {/* Primary tools */}
        <div className="flex items-center gap-0.5">
          {PRIMARY_TOOLS.map((tool) => {
            const isArmed = armedTool === tool.kind
            return (
              <Tooltip.Root key={tool.kind}>
                <Tooltip.Trigger asChild>
                  <button
                    onMouseDown={(e) => handleToolMouseDown(e, tool.kind)}
                    onClick={() => handleToolClick(tool.kind)}
                    onDoubleClick={() => handleToolDoubleClick(tool.kind)}
                    className={`canvas-tool-btn${isArmed ? ' canvas-tool-btn-armed' : ''}`}
                    aria-pressed={isArmed}
                  >
                    <i className={`fa-regular ${tool.icon} text-[15px] text-foreground`} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className={TOOLTIP_CLASS} sideOffset={10} side="top">
                    {tool.label}
                    {isArmed ? ' · click canvas to place' : ''}
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            )
          })}
        </div>

        <div className="canvas-toolbar-sep" />

        {/* More tools (+) button */}
        <div ref={moreMenuRef} className="relative flex items-center">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={() => setIsMoreOpen((prev) => !prev)}
                className={`canvas-tool-btn${isMoreOpen ? ' canvas-tool-btn-armed' : ''}`}
                aria-label="More tools"
              >
                <i
                  className={`fa-regular fa-plus text-[15px] text-foreground transition-transform duration-150 ${isMoreOpen ? 'rotate-45' : ''}`}
                />
              </button>
            </Tooltip.Trigger>
            {!isMoreOpen && (
              <Tooltip.Portal>
                <Tooltip.Content className={TOOLTIP_CLASS} sideOffset={10} side="top">
                  More tools
                </Tooltip.Content>
              </Tooltip.Portal>
            )}
          </Tooltip.Root>

          {isMoreOpen && (
            <div className="canvas-toolbar-pill absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 flex items-center gap-0.5 p-1 rounded-[56px]">
              {MORE_TOOLS.map((tool) => {
                const isArmed = armedTool === tool.kind
                return (
                  <Tooltip.Root key={tool.kind}>
                    <Tooltip.Trigger asChild>
                      <button
                        onMouseDown={(e) => handleToolMouseDown(e, tool.kind)}
                        onClick={() => {
                          handleToolClick(tool.kind)
                          setIsMoreOpen(false)
                        }}
                        onDoubleClick={() => {
                          handleToolDoubleClick(tool.kind)
                          setIsMoreOpen(false)
                        }}
                        className={`canvas-tool-btn${isArmed ? ' canvas-tool-btn-armed' : ''}`}
                        aria-pressed={isArmed}
                      >
                        <i className={`fa-regular ${tool.icon} text-[15px] text-foreground`} />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content className={TOOLTIP_CLASS} sideOffset={10} side="top">
                        {tool.label}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <AddLinkModal isOpen={isLinkModalOpen} onClose={handleLinkModalClose} onSubmit={handleLinkSubmit} />
    </Tooltip.Provider>
  )
})
