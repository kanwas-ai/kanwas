export function once(callback: () => void): () => void {
  let called = false

  return () => {
    if (called) {
      return
    }

    called = true
    callback()
  }
}
