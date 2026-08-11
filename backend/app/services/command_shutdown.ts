type TerminableCommand = {
  exitCode?: number
  app: {
    terminate: () => Promise<void>
  }
}

export async function finalizeCommandRun(
  command: TerminableCommand,
  onTerminateError: (error: unknown) => void
): Promise<void> {
  const exitCode = command.exitCode ?? 0
  process.exitCode = exitCode

  const forceExitTimer = setTimeout(() => {
    process.exit(exitCode)
  }, 10000)
  forceExitTimer.unref()

  try {
    await command.app.terminate()
  } catch (error) {
    onTerminateError(error)
  } finally {
    clearTimeout(forceExitTimer)
  }
}
