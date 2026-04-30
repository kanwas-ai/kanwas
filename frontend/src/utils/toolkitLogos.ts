const TOOLKIT_LOGOS: Record<string, string> = {
  gmail: 'https://logos.composio.dev/api/gmail',
  notion: 'https://logos.composio.dev/api/notion',
  googlesheets: 'https://logos.composio.dev/api/googlesheets',
  googledocs: 'https://logos.composio.dev/api/googledocs',
  slack: 'https://logos.composio.dev/api/slack',
  googledrive: 'https://logos.composio.dev/api/googledrive',
  linear: 'https://logos.composio.dev/api/linear',
  figma: 'https://logos.composio.dev/api/figma',
  posthog: 'https://logos.composio.dev/api/posthog',
  googleslides: 'https://logos.composio.dev/api/googleslides',
}

export function getToolkitLogo(toolkit: string): string | undefined {
  return TOOLKIT_LOGOS[toolkit.toLowerCase()]
}
