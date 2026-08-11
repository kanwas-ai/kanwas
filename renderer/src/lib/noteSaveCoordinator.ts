type NoteSaveFlusher = () => Promise<void>

class NoteSaveCoordinator {
  private readonly flushers = new Set<NoteSaveFlusher>()
  private activeFlush: Promise<void> | null = null

  register(flusher: NoteSaveFlusher): () => void {
    this.flushers.add(flusher)
    return () => this.flushers.delete(flusher)
  }

  flushAll(): Promise<void> {
    if (this.activeFlush) return this.activeFlush

    const flushers = [...this.flushers]
    const flush = Promise.allSettled(flushers.map((flusher) => flusher()))
      .then((results) => {
        const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failures.length > 0) {
          console.error(
            'Some note saves failed during shutdown',
            failures.map((failure) => failure.reason)
          )
        }
      })
      .finally(() => {
        if (this.activeFlush === flush) this.activeFlush = null
      })

    this.activeFlush = flush
    return flush
  }
}

export const noteSaveCoordinator = new NoteSaveCoordinator()
