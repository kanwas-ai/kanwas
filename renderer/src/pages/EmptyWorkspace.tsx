import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, FolderX, RefreshCw } from 'lucide-react'
import type { VaultSummary } from 'shared/local-api'
import { getDesktopBridge } from '@/lib/desktop'
import { showToast } from '@/utils/toast'

interface EmptyWorkspaceProps {
  state: 'loading' | 'empty' | 'error'
  error?: string
  onRetry: () => void
  vaults?: VaultSummary[]
}

export function EmptyWorkspace({ state, error, onRetry, vaults = [] }: EmptyWorkspaceProps) {
  const navigate = useNavigate()
  const [isOpening, setIsOpening] = useState(false)
  const [busyVaultId, setBusyVaultId] = useState<string | null>(null)
  const desktop = getDesktopBridge()

  const openFolder = async () => {
    if (!desktop) {
      showToast('Open Kanwas in Electron to choose a folder.', 'error')
      return
    }

    setIsOpening(true)
    try {
      const workspace = await desktop.openVault()
      if (workspace) navigate(`/w/${workspace.urlId}`, { replace: true })
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Failed to open folder', 'error')
    } finally {
      setIsOpening(false)
    }
  }

  const activateVault = async (vault: VaultSummary) => {
    if (!desktop || vault.status === 'missing') return
    setBusyVaultId(vault.id)
    try {
      const workspace = await desktop.activateVault(vault.id)
      onRetry()
      navigate(`/w/${workspace.urlId}`, { replace: true })
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Failed to open vault', 'error')
    } finally {
      setBusyVaultId(null)
    }
  }

  const forgetVault = async (vault: VaultSummary) => {
    if (!desktop) return
    setBusyVaultId(vault.id)
    try {
      await desktop.forgetVault(vault.id)
      onRetry()
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Failed to remove vault', 'error')
    } finally {
      setBusyVaultId(null)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-foreground">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-outline bg-editor">
          <FolderOpen className="h-7 w-7 text-foreground/60" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold">
          {state === 'loading'
            ? 'Opening Kanwas…'
            : state === 'error'
              ? 'Kanwas could not start'
              : vaults.length > 0
                ? 'Choose a vault'
                : 'Open a folder'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-foreground/60">
          {state === 'loading'
            ? 'Loading your local vaults.'
            : state === 'error'
              ? error
              : vaults.length > 0
                ? 'Open a remembered vault or choose another folder. Removing one here never deletes its files.'
                : 'Choose a folder to use as a local Kanwas vault. Your files stay on this computer.'}
        </p>

        {state === 'empty' && vaults.length > 0 && (
          <div className="mt-6 space-y-2 text-left">
            {vaults.map((vault) => (
              <div key={vault.id} className="flex items-center gap-3 rounded-lg border border-outline bg-editor p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{vault.name}</div>
                  <div className="truncate text-xs text-foreground/50">
                    {vault.status === 'missing' ? 'Folder missing' : vault.error || vault.path}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyVaultId !== null || vault.status === 'missing'}
                  onClick={() => void activateVault(vault)}
                  className="rounded-md border border-outline px-3 py-1.5 text-xs hover:bg-block-hover disabled:opacity-40"
                >
                  {busyVaultId === vault.id ? 'Opening…' : vault.status === 'error' ? 'Retry' : 'Open'}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${vault.name} from Kanwas`}
                  title="Remove from Kanwas (files stay on disk)"
                  disabled={busyVaultId !== null}
                  onClick={() => void forgetVault(vault)}
                  className="rounded-md p-2 text-foreground/55 hover:bg-block-hover hover:text-red-500 disabled:opacity-40"
                >
                  <FolderX className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        {state === 'empty' && (
          <button
            type="button"
            onClick={() => void openFolder()}
            disabled={isOpening}
            className="mt-7 inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            {isOpening ? 'Opening…' : 'Open Folder…'}
          </button>
        )}

        {state === 'error' && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-7 inline-flex items-center gap-2 rounded-lg border border-outline bg-editor px-5 py-2.5 text-sm font-medium hover:bg-block-hover"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        )}
      </section>
    </main>
  )
}
