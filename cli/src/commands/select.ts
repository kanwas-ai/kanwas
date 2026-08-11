import chalk from 'chalk'

interface SelectOption {
  label: string
  value: string
  hint?: string
}

/**
 * Interactive arrow-key picker. Returns the selected option's value.
 */
export async function selectPrompt(title: string, options: SelectOption[]): Promise<string> {
  if (options.length === 0) {
    throw new Error('No options to select from.')
  }

  let cursor = 0

  function render() {
    // Move up to clear previous render (except first time)
    const lines = options.length + 1 // title + options
    process.stdout.write(`\x1B[${lines}A\x1B[0J`)
    printList()
  }

  function printList() {
    console.log(chalk.bold(title))
    options.forEach((opt, i) => {
      const pointer = i === cursor ? chalk.cyan('❯') : ' '
      const label = i === cursor ? chalk.cyan(opt.label) : opt.label
      const hint = opt.hint ? chalk.dim(` (${opt.hint})`) : ''
      console.log(`  ${pointer} ${label}${hint}`)
    })
  }

  // Initial render
  printList()

  return new Promise((resolve) => {
    const stdin = process.stdin
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf-8')

    const onData = (key: string) => {
      // Ctrl+C
      if (key === '\x03') {
        stdin.setRawMode(false)
        stdin.removeListener('data', onData)
        process.exit(0)
      }

      // Enter
      if (key === '\r' || key === '\n') {
        stdin.setRawMode(false)
        stdin.removeListener('data', onData)
        stdin.pause()
        resolve(options[cursor].value)
        return
      }

      // Arrow keys (escape sequences)
      if (key === '\x1B[A' || key === 'k') {
        // Up
        cursor = (cursor - 1 + options.length) % options.length
        render()
      } else if (key === '\x1B[B' || key === 'j') {
        // Down
        cursor = (cursor + 1) % options.length
        render()
      }
    }

    stdin.on('data', onData)
  })
}
