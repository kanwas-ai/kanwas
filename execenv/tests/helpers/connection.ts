/**
 * Connection and watcher tracking utilities for integration tests.
 *
 * These helpers track resources for proper cleanup and provide syncer factories.
 */

import { PathMapper, type WorkspaceConnection } from 'shared'
import { FilesystemSyncer, ContentConverter, type FileUploader, type FileReader } from 'shared/server'
import { FileWatcher } from '../../src/watcher.js'

/**
 * Track a connection for cleanup in afterEach.
 */
export function trackConnection<T extends WorkspaceConnection>(conn: T, array: WorkspaceConnection[]): T {
  array.push(conn)
  return conn
}

/**
 * Track a watcher for cleanup in afterEach.
 */
export function trackWatcher<T extends FileWatcher>(watcher: T, array: FileWatcher[]): T {
  array.push(watcher)
  return watcher
}

/**
 * Clean up all tracked watchers (async).
 */
export async function cleanupWatchers(watchers: FileWatcher[]): Promise<void> {
  for (const watcher of watchers) {
    await watcher.stop()
  }
  watchers.length = 0
}

/**
 * Clean up all tracked connections (sync).
 */
export function cleanupConnections(connections: WorkspaceConnection[]): void {
  for (const conn of connections) {
    try {
      conn.disconnect()
    } catch {
      // Ignore errors during cleanup
    }
  }
  connections.length = 0
}

export interface TestSyncerOptions {
  /** File uploader for binary file operations */
  fileUploader: FileUploader
  /** File reader for binary file operations */
  fileReader: FileReader
}

/**
 * Create a FilesystemSyncer configured for testing.
 * File handlers are required - use createNoOpFileUploader/createNoOpFileReader for tests
 * that don't need binary file support.
 */
export function createTestSyncer(
  connection: WorkspaceConnection,
  options: TestSyncerOptions
): { syncer: FilesystemSyncer; pathMapper: PathMapper; contentConverter: ContentConverter } {
  const pathMapper = new PathMapper()
  pathMapper.buildFromWorkspace(connection.proxy)
  const contentConverter = new ContentConverter()
  const syncer = new FilesystemSyncer({
    proxy: connection.proxy,
    yDoc: connection.yDoc,
    pathMapper,
    contentConverter,
    fileUploader: options.fileUploader,
    fileReader: options.fileReader,
  })

  return { syncer, pathMapper, contentConverter }
}
