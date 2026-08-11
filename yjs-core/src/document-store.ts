/**
 * Persistence boundary for the embedded sync core.
 *
 * The core deliberately knows nothing about the concrete persistence medium.
 * The embedding runtime owns that choice.
 */
export interface DocumentStore {
  loadRoot(workspaceId: string): Promise<Uint8Array | null>
  saveRoot(workspaceId: string, documentBytes: Uint8Array): Promise<void>
  loadNote(workspaceId: string, noteId: string): Promise<Uint8Array | null>
  saveNote(workspaceId: string, noteId: string, documentBytes: Uint8Array): Promise<void>
  deleteNote(workspaceId: string, noteId: string): Promise<void>
}
