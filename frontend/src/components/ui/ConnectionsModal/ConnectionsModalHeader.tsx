import { Button } from '@/components/ui/Button'

interface ConnectionsModalHeaderProps {
  installedCount: number
  totalCount: number
  onClose: () => void
}

export function ConnectionsModalHeader({ installedCount, totalCount, onClose }: ConnectionsModalHeaderProps) {
  return (
    <header className="flex items-center justify-between px-5 lg:px-6 py-4 border-b border-outline">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-plug text-foreground-muted" />
          <h2 className="text-lg font-semibold text-foreground">Connections</h2>
        </div>

        <p className="text-sm text-foreground-muted mt-1 truncate">
          {installedCount} installed, {totalCount} connections available
        </p>
      </div>

      <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
        <i className="fa-solid fa-xmark text-foreground-muted" />
      </Button>
    </header>
  )
}
