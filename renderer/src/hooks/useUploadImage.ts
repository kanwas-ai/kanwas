import { useMutation } from '@tanstack/react-query'
import { localApi } from '@/api/client'
import { showToast } from '@/utils/toast'

interface UploadImageParams {
  file: File
  workspaceId: string
  canvasId: string
  filename: string
}

export function useUploadImage() {
  return useMutation({
    mutationFn: ({ file, workspaceId, canvasId, filename }: UploadImageParams) =>
      localApi.uploadFile(workspaceId, file, canvasId, filename),
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to upload image'
      showToast(message, 'error')
    },
  })
}
