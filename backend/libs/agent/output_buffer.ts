/**
 * OutputBuffer handles streaming command output with:
 * - Carriage return (\r) processing for progress bars
 * - ANSI escape code stripping
 * - Line count limiting for payload size control
 * - Individual line length limiting to prevent large payloads
 */
export class OutputBuffer {
  private displayLines: string[] = []
  private currentLine: string = ''
  private totalLineCount: number = 0
  private lineTruncated: boolean = false

  constructor(
    private maxDisplayLines: number = 30,
    private maxLineLength: number = 1000
  ) {}

  /**
   * Append new data to the buffer.
   * Strips ANSI codes, handles \r by overwriting current line content,
   * handles \n by completing the line and moving to next.
   */
  append(data: string): void {
    // Strip ANSI escape codes (colors, cursor movement, etc.)
    // eslint-disable-next-line no-control-regex
    const clean = data.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')

    for (const char of clean) {
      if (char === '\r') {
        // Carriage return: reset current line (progress bar behavior)
        this.currentLine = ''
        this.lineTruncated = false
      } else if (char === '\n') {
        // Newline: commit current line
        this.commitLine()
      } else if (char >= ' ' || char === '\t') {
        // Only allow printable chars and tab, enforce max line length
        if (this.currentLine.length < this.maxLineLength) {
          this.currentLine += char
        } else {
          this.lineTruncated = true
        }
      }
      // Silently ignore other control characters
    }
  }

  private commitLine(): void {
    // Add truncation indicator if line was capped
    const line = this.lineTruncated ? this.currentLine + '...' : this.currentLine
    this.displayLines.push(line)
    this.currentLine = ''
    this.lineTruncated = false
    this.totalLineCount++

    // Keep only last maxDisplayLines
    if (this.displayLines.length > this.maxDisplayLines) {
      this.displayLines.shift()
    }
  }

  /**
   * Get display output (last N lines + current incomplete line)
   */
  getDisplayOutput(): string {
    if (this.currentLine) {
      // Add truncation indicator to current line if it hit the limit
      const displayCurrentLine = this.lineTruncated ? this.currentLine + '...' : this.currentLine
      return [...this.displayLines, displayCurrentLine].join('\n')
    }
    return this.displayLines.join('\n')
  }

  /**
   * Get total line count (for showing "N more lines above" indicator)
   */
  getTotalLineCount(): number {
    return this.totalLineCount + (this.currentLine ? 1 : 0)
  }

  /**
   * Get count of hidden lines (total - displayed)
   */
  getHiddenLineCount(): number {
    const displayedCount = this.displayLines.length + (this.currentLine ? 1 : 0)
    return Math.max(0, this.getTotalLineCount() - displayedCount)
  }
}
