import vine from '@vinejs/vine'
import { AGENT_MODES } from '#agent/modes'

export const invokeValidator = vine.compile(
  vine.object({
    invocation_id: vine.string().uuid().nullable().optional(),
    edited_invocation_id: vine.string().uuid().nullable().optional(),
    canvas_id: vine.string().nullable().optional(), // May be a canvas UUID or the root canvas id
    query: vine.string().minLength(1),
    mode: vine.enum([...AGENT_MODES]).optional(),
    files: vine
      .array(
        vine.file({
          size: '50mb',
          extnames: [
            // Images
            'jpg',
            'jpeg',
            'png',
            'gif',
            'webp',
            'svg',
            'bmp',
            'tiff',
            'ico',
            // Videos
            'mp4',
            'webm',
            'mov',
            'avi',
            'mkv',
            'flv',
            'wmv',
            'm4v',
            // Audio
            'mp3',
            'wav',
            'ogg',
            'm4a',
            'aac',
            'flac',
            'wma',
            'opus',
            // Documents
            'pdf',
            'doc',
            'docx',
            'xls',
            'xlsx',
            'ppt',
            'pptx',
            'odt',
            'ods',
            'odp',
            // Text
            'txt',
            'md',
            'json',
            'xml',
            'csv',
            'yaml',
            'yml',
            'html',
            'css',
            'js',
            'ts',
            'jsx',
            'tsx',
            // Other
            'rtf',
            'epub',
            'mobi',
          ],
        })
      )
      .maxLength(10)
      .optional(),
    yolo_mode: vine.boolean().optional(),
    selected_text: vine
      .object({
        node_id: vine.string().uuid(),
        node_name: vine.string(),
        text: vine.string(),
      })
      .optional(),
    // Pre-computed context from frontend (avoids a live Yjs socket connection)
    workspace_tree: vine.string().optional(),
    canvas_path: vine.string().nullable().optional(),
    active_canvas_context: vine.string().nullable().optional(),
    selected_node_paths: vine.array(vine.string()).optional(),
    mentioned_node_paths: vine.array(vine.string()).optional(),
    source: vine.string().optional(),
  })
)

const cancelOperation = {
  type: vine.literal('cancel_operation'),
  reason: vine.string().minLength(1).optional(),
}

const commands = vine.group([vine.group.if((data) => data.type === 'cancel_operation', cancelOperation)])

export const CommandSchema = vine.compile(
  vine
    .object({
      type: vine.enum(['cancel_operation']),
    })
    .merge(commands)
)

export const answerQuestionValidator = vine.compile(
  vine.object({
    answers: vine.record(vine.array(vine.string())),
    canvas_id: vine.string().nullable().optional(),
    mode: vine.enum([...AGENT_MODES]).optional(),
    yolo_mode: vine.boolean().optional(),
    workspace_tree: vine.string().optional(),
    canvas_path: vine.string().nullable().optional(),
    active_canvas_context: vine.string().nullable().optional(),
    selected_node_paths: vine.array(vine.string()).optional(),
    mentioned_node_paths: vine.array(vine.string()).optional(),
  })
)
