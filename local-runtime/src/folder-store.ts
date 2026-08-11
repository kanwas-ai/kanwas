import type { DocumentStore } from '@kanwas/yjs-core/document-store'
import type { FolderFlusher } from './folder-flusher.js'

/**
 * The folder-backed DocumentStore — the seam where a room's debounced
 * `scheduleSave` becomes a yDoc→folder flush.
 *
 * One FolderStore is shared by every mount in the process (all workspaces' rooms
 * write through it). It keeps the latest root/note bytes in memory per workspace
 * (exactly like the 2A InMemoryDocumentStore) so each room's own reload path
 * stays coherent within a run; the yDoc remains an ephemeral edit buffer rebuilt
 * from its folder at boot. What is NEW here (multi-mount): each save/delete is
 * routed, by the `workspaceId` the caller already passes, to that workspace's OWN
 * `FolderFlusher` via the `flushers` map — one per mounted folder, bound when a
 * mount arms its flusher and unbound when the mount stops.
 *
 * Arming is deferred until after boot (adoption + replaceDocument seed + the sync
 * orchestrator) so the seed's own saveRoot/saveNote — which merely re-persist the
 * state that was just read FROM the folder — do NOT trigger a redundant (and
 * potentially frontmatter-mangling) rewrite. Only genuine post-boot UI edits flush.
 *
 * A workspaceId with no bound flusher (not yet mounted, or already unmounted)
 * still buffers bytes so its room stays coherent — it just never flushes to disk.
 */
export class FolderStore implements DocumentStore {
  private roots = new Map<string, Uint8Array>()
  private notes = new Map<string, Uint8Array>()
  private flushers = new Map<string, FolderFlusher>()

  /** Bind a mount's flusher once its orchestrator is up; its saves now flush to disk. */
  bindFlusher(workspaceId: string, flusher: FolderFlusher): void {
    this.flushers.set(workspaceId, flusher)
  }

  /**
   * Unbind a mount's flusher (on stop/unmount) and drop its buffered bytes, so a
   * later remount of the same workspace re-seeds cleanly from the folder instead
   * of replaying stale in-memory state.
   */
  unbindFlusher(workspaceId: string): void {
    this.flushers.delete(workspaceId)
    this.roots.delete(workspaceId)
    const prefix = this.noteKey(workspaceId, '')
    for (const key of this.notes.keys()) {
      if (key.startsWith(prefix)) this.notes.delete(key)
    }
  }

  private noteKey(workspaceId: string, noteId: string): string {
    return `${workspaceId}::${noteId}`
  }

  async loadRoot(workspaceId: string): Promise<Uint8Array | null> {
    return this.roots.get(workspaceId) ?? null
  }

  async saveRoot(workspaceId: string, documentBytes: Uint8Array): Promise<void> {
    this.roots.set(workspaceId, documentBytes)
    this.flushers.get(workspaceId)?.rootChanged()
  }

  async loadNote(workspaceId: string, noteId: string): Promise<Uint8Array | null> {
    return this.notes.get(this.noteKey(workspaceId, noteId)) ?? null
  }

  async saveNote(workspaceId: string, noteId: string, documentBytes: Uint8Array): Promise<void> {
    this.notes.set(this.noteKey(workspaceId, noteId), documentBytes)
    this.flushers.get(workspaceId)?.noteChanged(noteId)
  }

  async deleteNote(workspaceId: string, noteId: string): Promise<void> {
    this.notes.delete(this.noteKey(workspaceId, noteId))
    this.flushers.get(workspaceId)?.noteDeleted(noteId)
  }
}
