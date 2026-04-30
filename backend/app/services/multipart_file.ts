type DiskMovableFile = {
  moveToDisk: (key: string) => Promise<void>
}

export async function moveMultipartFileToDisk(file: unknown, key: string): Promise<void> {
  if (typeof file !== 'object' || file === null) {
    throw new TypeError('Uploaded file does not support moveToDisk')
  }

  const movableFile = file as Partial<DiskMovableFile>
  if (typeof movableFile.moveToDisk !== 'function') {
    throw new TypeError('Uploaded file does not support moveToDisk')
  }

  await movableFile.moveToDisk(key)
}
