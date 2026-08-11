// ANSI color codes to CSS colors
const ANSI_COLORS: Record<string, string> = {
  // Standard colors
  '30': '#000000', // Black
  '31': '#f87171', // Red
  '32': '#4ade80', // Green
  '33': '#fbbf24', // Yellow
  '34': '#60a5fa', // Blue
  '35': '#c084fc', // Magenta
  '36': '#22d3ee', // Cyan
  '37': '#f5f5f5', // White
  // Bright colors
  '90': '#a1a1aa', // Bright Black (Gray)
  '91': '#fca5a5', // Bright Red
  '92': '#86efac', // Bright Green
  '93': '#fde047', // Bright Yellow
  '94': '#93c5fd', // Bright Blue
  '95': '#d8b4fe', // Bright Magenta
  '96': '#67e8f9', // Bright Cyan
  '97': '#ffffff', // Bright White
}

// Background colors
const ANSI_BG_COLORS: Record<string, string> = {
  '40': '#000000',
  '41': '#ef4444',
  '42': '#22c55e',
  '43': '#eab308',
  '44': '#3b82f6',
  '45': '#a855f7',
  '46': '#06b6d4',
  '47': '#f5f5f5',
}

/**
 * Convert ANSI escape codes to HTML spans with inline styles.
 * Handles basic foreground and background colors.
 */
export function ansiToHtml(text: string): string {
  // Escape HTML entities first
  let result = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  // Track open spans to properly close them
  let openSpans = 0

  // Replace ANSI codes with HTML spans
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x1b\[([0-9;]+)m/g, (_, codes) => {
    const codeList = codes.split(';')
    let html = ''

    for (const code of codeList) {
      if (code === '0') {
        // Reset - close all open spans
        while (openSpans > 0) {
          html += '</span>'
          openSpans--
        }
      } else if (code === '1') {
        // Bold
        html += '<span style="font-weight: bold;">'
        openSpans++
      } else if (code === '3') {
        // Italic
        html += '<span style="font-style: italic;">'
        openSpans++
      } else if (code === '4') {
        // Underline
        html += '<span style="text-decoration: underline;">'
        openSpans++
      } else if (ANSI_COLORS[code]) {
        html += `<span style="color: ${ANSI_COLORS[code]};">`
        openSpans++
      } else if (ANSI_BG_COLORS[code]) {
        html += `<span style="background-color: ${ANSI_BG_COLORS[code]};">`
        openSpans++
      }
    }

    return html
  })

  // Close any remaining open spans
  while (openSpans > 0) {
    result += '</span>'
    openSpans--
  }

  // Convert newlines to <br/>
  result = result.replace(/\n/g, '<br/>')

  return result
}
