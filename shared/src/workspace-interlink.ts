export {
  WORKSPACE_PATH_PREFIX,
  WORKSPACE_INTERLINK_TYPE,
  WORKSPACE_INTERLINK_VERSION,
  WORKSPACE_INTERLINK_PROP_SCHEMA,
  parseWorkspaceHref,
  isWorkspaceHref,
  buildWorkspaceHref,
  getWorkspaceInterlinkLabel,
  createWorkspaceInterlinkProps,
  workspaceInterlinkHrefFromProps,
  convertWorkspaceLinkInlineToInterlink,
  convertWorkspaceInterlinkInlineToLink,
  convertWorkspaceLinksToInterlinksInBlocks,
  convertWorkspaceInterlinksToLinksInBlocks,
} from './workspace/workspace-interlink.js'

export type { ParsedWorkspaceHref, WorkspaceInterlinkProps } from './workspace/workspace-interlink.js'
