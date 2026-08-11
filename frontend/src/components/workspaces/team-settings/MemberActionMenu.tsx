import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

interface MemberActionMenuProps {
  memberName: string
  memberRole: string
  onRemove: () => void
  onChangeRole: (role: 'admin' | 'member') => void
  isLoading?: boolean
  disabled?: boolean
}

export function MemberActionMenu({
  memberName,
  memberRole,
  onRemove,
  onChangeRole,
  isLoading,
  disabled,
}: MemberActionMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-muted hover:bg-block-highlight transition-colors cursor-pointer outline-none"
          aria-label={`Actions for ${memberName}`}
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <i className="fa-solid fa-spinner fa-spin text-[12px]" />
          ) : (
            <i className="fa-solid fa-ellipsis text-[12px]" />
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[180px] bg-canvas border border-outline rounded-lg shadow-lg p-1 z-[80]"
          sideOffset={5}
          align="end"
        >
          {memberRole === 'member' ? (
            <DropdownMenu.Item
              className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none text-foreground hover:bg-block-hover"
              onSelect={() => onChangeRole('admin')}
            >
              <i className="fa-solid fa-shield-halved text-[12px]" />
              Make admin
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.Item
              className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none text-foreground hover:bg-block-hover"
              onSelect={() => onChangeRole('member')}
            >
              <i className="fa-solid fa-user text-[12px]" />
              Remove admin
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className="h-px bg-outline my-1" />

          <DropdownMenu.Item
            className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer outline-none text-status-error hover:bg-block-hover"
            onSelect={onRemove}
          >
            <i className="fa-solid fa-user-minus text-[12px]" />
            Remove from team
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
