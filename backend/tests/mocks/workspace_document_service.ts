import { createWorkspaceContentStore, once, type WorkspaceDocument, type WorkspaceSnapshotBundle } from 'shared'
import { createWorkspaceSnapshotBundle, hydrateWorkspaceSnapshotBundle } from 'shared/server'
import Workspace from '#models/workspace'
import {
  LiveWorkspaceDocumentError,
  type GetWorkspaceDocumentOptions,
  type WorkspaceDocumentConnection,
} from '#services/workspace_document_service'
import { createYjsProxy } from 'valtio-y'
import { getMockYjsServerSnapshot } from '#tests/mocks/yjs_server_document_store'

export default class MockWorkspaceDocumentService {
  async getWorkspaceDocument(
    workspaceId: string,
    _options: GetWorkspaceDocumentOptions = {}
  ): Promise<WorkspaceDocumentConnection> {
    const storedDocument = getMockYjsServerSnapshot(workspaceId)

    if (!storedDocument) {
      const workspace = await Workspace.find(workspaceId)

      if (!workspace) {
        throw new LiveWorkspaceDocumentError(
          'YJS_SERVER_CONNECTION_FAILED',
          `Workspace ${workspaceId} is not available in mock live document service`
        )
      }

      throw new LiveWorkspaceDocumentError(
        'YJS_SERVER_CONNECTION_FAILED',
        `Workspace ${workspaceId} has no document in mock Yjs server store`
      )
    }

    const yDoc = hydrateWorkspaceSnapshotBundle(storedDocument)

    const { proxy, dispose } = createYjsProxy<WorkspaceDocument>(yDoc, {
      getRoot: (doc) => doc.getMap('state'),
    })

    const cleanup = once(() => {
      dispose()
      yDoc.destroy()
    })

    return {
      proxy,
      yDoc,
      provider: {} as WorkspaceDocumentConnection['provider'],
      contentStore: createWorkspaceContentStore(yDoc),
      cleanup,
    }
  }

  async withWorkspaceDocument<T>(
    workspaceId: string,
    handler: (doc: WorkspaceDocumentConnection) => Promise<T> | T,
    options: GetWorkspaceDocumentOptions = {}
  ): Promise<T> {
    const document = await this.getWorkspaceDocument(workspaceId, options)

    try {
      return await handler(document)
    } finally {
      document.cleanup()
    }
  }

  async readSnapshotBundle(
    workspaceId: string,
    options: GetWorkspaceDocumentOptions = {}
  ): Promise<WorkspaceSnapshotBundle> {
    return this.withWorkspaceDocument(
      workspaceId,
      ({ yDoc }) => {
        return createWorkspaceSnapshotBundle(yDoc)
      },
      options
    )
  }
}
