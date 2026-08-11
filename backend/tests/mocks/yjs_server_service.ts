import Workspace from '#models/workspace'
import { YjsServerDurabilityError } from '#services/yjs_server_service'
import { setMockYjsServerSnapshot } from '#tests/mocks/yjs_server_document_store'
import type { WorkspaceSnapshotBundle } from 'shared'

export default class MockYjsServerService {
  async replaceDocument(
    workspaceId: string,
    document: WorkspaceSnapshotBundle,
    options: { reason?: string; notifyBackend?: boolean } = {}
  ): Promise<void> {
    const workspace = await Workspace.find(workspaceId)

    if (!workspace) {
      if (options.notifyBackend === false) {
        return
      }

      throw new YjsServerDurabilityError(`Workspace ${workspaceId} not found for mock Yjs server write`)
    }

    setMockYjsServerSnapshot(workspaceId, document)
  }
}
