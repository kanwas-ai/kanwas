/**
 * Calculate the client rect position of the caret in a textarea
 * by creating a mirror element with identical styling
 */
export function getCaretClientRect(textarea: HTMLTextAreaElement) {
  const { selectionEnd } = textarea
  const style = getComputedStyle(textarea)
  const taRect = textarea.getBoundingClientRect()

  const mirror = document.createElement('div')

  // Copy layout-affecting styles
  const props = [
    'boxSizing',
    'width',
    'height',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontFamily',
    'lineHeight',
    'letterSpacing',
    'textTransform',
    'textAlign',
    'textIndent',
    'whiteSpace',
    'wordBreak',
    'wordSpacing',
    'tabSize',
  ] as const
  props.forEach((prop) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mirror.style as any)[prop] = style[prop]
  })

  // Place the mirror exactly over the textarea in viewport space
  mirror.style.position = 'fixed'
  mirror.style.top = `${taRect.top}px`
  mirror.style.left = `${taRect.left}px`
  mirror.style.width = `${taRect.width}px`

  // Make it scroll like the textarea so the caret position matches the visible area
  mirror.style.height = `${textarea.clientHeight}px`
  mirror.style.overflow = 'auto'

  // Text wrapping identical to textarea
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'

  const before = textarea.value.substring(0, selectionEnd)
  const after = textarea.value.substring(selectionEnd)

  // Create a caret marker
  const span = document.createElement('span')
  span.textContent = after.length === 0 ? '\u200b' : after[0]
  span.style.display = 'inline-block'

  mirror.textContent = before
  mirror.appendChild(span)
  document.body.appendChild(mirror)

  // Sync scroll positions from the real textarea
  mirror.scrollTop = textarea.scrollTop
  mirror.scrollLeft = textarea.scrollLeft

  const spanRect = span.getBoundingClientRect()
  const lineHeight = parseFloat(style.lineHeight || '0') || spanRect.height || 18

  document.body.removeChild(mirror)

  return { top: spanRect.top, left: spanRect.left, height: lineHeight }
}

/**
 * Calculate dropdown position relative to caret, with viewport bounds checking
 */
export function calculateDropdownPosition(
  caretPos: { top: number; left: number; height: number },
  dropdownWidth: number,
  dropdownHeight: number,
  gap = 8
): { top: number; left: number } {
  const enoughSpaceAbove = caretPos.top >= dropdownHeight + 20
  const rawTop = enoughSpaceAbove ? caretPos.top - dropdownHeight - gap : caretPos.top + caretPos.height + gap

  const left = Math.max(12, Math.min(caretPos.left, window.innerWidth - dropdownWidth - 12))
  const top = Math.max(12, Math.min(rawTop, window.innerHeight - dropdownHeight - 12))

  return { top, left }
}
