/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_YJS_SERVER_URL?: string
  readonly VITE_AUTH_TOKEN_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
