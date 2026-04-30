import { useCallback } from 'react'
import {
  useConnections,
  useDisconnectConnection,
  useInitiateConnection,
  useRefreshConnections,
} from '@/hooks/useConnections'
import { Modal } from '@/components/ui/Modal'
import { ConnectionsCatalogPanel } from './ConnectionsCatalogPanel'
import { CustomAuthConfigModal } from './CustomAuthConfigModal'
import { useConnectionPopupFlow } from './useConnectionPopupFlow'

interface ConnectionsModalProps {
  isOpen: boolean
  onClose: () => void
  workspaceId: string
  initialSearch?: string | null
}

export function ConnectionsModal({ isOpen, onClose, workspaceId, initialSearch }: ConnectionsModalProps) {
  const { data: connections, isLoading } = useConnections(workspaceId, { enabled: isOpen })
  const initiateConnection = useInitiateConnection(workspaceId)
  const disconnectConnection = useDisconnectConnection(workspaceId)
  const refreshConnections = useRefreshConnections(workspaceId)

  const {
    activeAttempt,
    connectToolkit,
    pendingCustomAuthPrompt,
    isSubmittingCustomAuth,
    closeCustomAuthPrompt,
    submitCustomAuthPrompt,
  } = useConnectionPopupFlow({
    isOpen,
    initiateConnection: initiateConnection.mutateAsync,
    refreshConnections,
  })

  const handleDisconnect = useCallback(
    async (connectedAccountId: string) => {
      await disconnectConnection.mutateAsync(connectedAccountId)
    },
    [disconnectConnection]
  )

  const activeAttemptToolkit = activeAttempt?.toolkit ?? null
  const isConnectionAttemptInProgress = activeAttemptToolkit !== null

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose}>
        <ConnectionsCatalogPanel
          isOpen={isOpen}
          isLoading={isLoading}
          connections={connections}
          onClose={onClose}
          onConnectToolkit={connectToolkit}
          onDisconnect={handleDisconnect}
          activeAttemptToolkit={activeAttemptToolkit}
          isConnectionAttemptInProgress={isConnectionAttemptInProgress}
          initialSearch={initialSearch}
        />
      </Modal>

      <CustomAuthConfigModal
        isOpen={pendingCustomAuthPrompt !== null}
        toolkit={pendingCustomAuthPrompt?.toolkit ?? ''}
        requirements={pendingCustomAuthPrompt?.requirements ?? null}
        isSubmitting={isSubmittingCustomAuth}
        onClose={closeCustomAuthPrompt}
        onSubmit={submitCustomAuthPrompt}
      />
    </>
  )
}
