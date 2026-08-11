export const CANVAS_EDITABLE_TARGET_SELECTOR =
  '.bn-editor, .blocknote-editor, [contenteditable="true"], input, textarea'
export const BLOCKNOTE_EDITOR_TARGET_SELECTOR = '.bn-editor, .blocknote-editor'

export function getElementFromEventTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target
  }

  if (target instanceof Node) {
    return target.parentElement
  }

  return null
}

export function isCanvasEditableTarget(element: Element | null): boolean {
  return !!element?.closest(CANVAS_EDITABLE_TARGET_SELECTOR)
}

export function isBlockNoteEditorElement(element: Element | null): boolean {
  return !!element?.closest(BLOCKNOTE_EDITOR_TARGET_SELECTOR)
}

function isFormTextInputElement(element: Element | null): boolean {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

export interface CanvasPasteClaimContext {
  canvasActive: boolean
  activeElement: Element | null
  pointerTarget: Element | null
  clipboardHasImportableContent: boolean
}

export function shouldClaimCanvasPaste({
  canvasActive,
  activeElement,
  pointerTarget,
  clipboardHasImportableContent,
}: CanvasPasteClaimContext): boolean {
  if (!canvasActive || !clipboardHasImportableContent) {
    return false
  }

  if (isCanvasEditableTarget(pointerTarget)) {
    return false
  }

  if (isFormTextInputElement(activeElement)) {
    return false
  }

  const activeContentEditable = activeElement?.closest('[contenteditable="true"]') ?? null
  const activeBlockNoteEditor = isBlockNoteEditorElement(activeElement)

  if (activeBlockNoteEditor && !pointerTarget) {
    return false
  }

  if (activeContentEditable && !activeBlockNoteEditor) {
    return false
  }

  return true
}
