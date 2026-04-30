import { z } from 'zod'

// ============================================================================
// Legacy Document Operation Schemas (kept for internal tool use)
// ============================================================================
export const createOperationSchema = z.object({
  operation: z.object({
    type: z.literal('create'),
    name: z.string(),
    content: z.string().describe('HTML content WITHOUT any id or data-block-id attributes. Just clean HTML elements.'),
  }),
})

export const updateOperationSchema = z.object({
  operation: z.object({
    type: z.literal('update'),
    documentId: z.string(),
    operations: z.array(
      z.object({
        type: z.enum(['replace', 'insert', 'delete']),
        blockId: z
          .string()
          .optional()
          .describe(
            'Sequential block ID (b1, b2, etc.) from the provided HTML. Required for replace or delete. Omit for insert operations.'
          ),
        content: z
          .string()
          .optional()
          .describe(
            'HTML content WITHOUT any id. Just clean HTML elements. For delete operations, this should be omitted.'
          ),
        afterBlockId: z
          .string()
          .nullable()
          .optional()
          .describe('Sequential block ID (b1, b2, etc.) to insert after. Use null for beginning.'),
      })
    ),
  }),
})

export const deleteOperationSchema = z.object({
  operation: z.object({
    type: z.literal('delete'),
    documentId: z.string(),
  }),
})
