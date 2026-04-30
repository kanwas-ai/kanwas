import { useEffect } from 'react'

interface CollaborationUserInfoEditor {
  updateCollaborationUserInfo?: (user: { name: string; color: string }) => void
}

export function useBlockNoteCollaborationUserInfo(editor: object, user: { name: string; color: string }) {
  useEffect(() => {
    ;(editor as CollaborationUserInfoEditor).updateCollaborationUserInfo?.(user)
  }, [editor, user])
}
