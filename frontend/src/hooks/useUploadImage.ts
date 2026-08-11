import { useMutation } from '@tanstack/react-query'
import { tuyau } from '@/api/client'
import { showToast } from '@/utils/toast'

interface UploadImageParams {
  file: File
  workspaceId: string
  canvasId: string
  filename: string
}

interface UploadResult {
  storagePath: string
  mimeType: string
  size: number
}

export function useUploadImage() {
  return useMutation({
    mutationFn: async ({ file, workspaceId, canvasId, filename }: UploadImageParams): Promise<UploadResult> => {
      const response = await tuyau.workspaces({ id: workspaceId }).files.$post({
        file,
        canvas_id: canvasId,
        filename,
      })

      if (response.error) {
        throw new Error('Failed to upload image')
      }

      return response.data as UploadResult
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to upload image'
      showToast(message, 'error')
    },
  })
}
