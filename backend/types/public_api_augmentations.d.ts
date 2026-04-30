/// <reference path="../config/auth.ts" />
/// <reference path="../config/drive.ts" />
/// <reference path="./http_context.d.ts" />

import type { DriveDisks, WriteOptions } from '@adonisjs/drive/types'

declare module '@adonisjs/core/bodyparser' {
  interface MultipartFile {
    moveToDisk(
      key: string,
      disk?: keyof DriveDisks,
      options?: WriteOptions & {
        moveAs?: 'stream' | 'buffer'
      }
    ): Promise<void>

    moveToDisk(
      key: string,
      options?: WriteOptions & {
        moveAs?: 'stream' | 'buffer'
      }
    ): Promise<void>
  }
}

export {}
