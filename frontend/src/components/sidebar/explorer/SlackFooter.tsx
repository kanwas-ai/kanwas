import * as Tooltip from '@radix-ui/react-tooltip'
import { getToolkitLogo } from '@/utils/toolkitLogos'

export const SLACK_INVITE_URL =
  'https://join.slack.com/t/kanwaskollective/shared_invite/zt-3vsln4mro-omqBG1gi1Kmc9fgzTHL7oQ'

const SLACK_TOOLTIP = 'Have feedback, bug reports, or improvement ideas? Chat with us in Slack.'
const SLACK_LOGO_URL = getToolkitLogo('slack')

export function SlackFooter() {
  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <a
            href={SLACK_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group block w-full cursor-pointer select-none mb-4"
            aria-label="Join our Slack"
          >
            <div className="flex items-center font-medium h-[32px] mx-1 px-3 rounded-[var(--chat-radius)] hover:bg-sidebar-hover transition-colors">
              {SLACK_LOGO_URL ? (
                <img src={SLACK_LOGO_URL} alt="" className="h-[14px] w-[14px] shrink-0 object-contain" />
              ) : (
                <i className="fa-solid fa-hashtag shrink-0 text-[12px] text-sidebar-icon" aria-hidden="true" />
              )}
              <span className="text-sm text-sidebar-item-text ml-1.5">Join our Slack</span>
              <i
                className="fa-solid fa-arrow-up-right-from-square ml-auto text-[10px] text-sidebar-icon opacity-70 group-hover:text-foreground transition-colors"
                aria-hidden="true"
              />
            </div>
          </a>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-[70] max-w-[240px] rounded-lg bg-[var(--palette-tooltip)] px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
            side="top"
            align="center"
            sideOffset={8}
          >
            {SLACK_TOOLTIP}
            <Tooltip.Arrow className="fill-[var(--palette-tooltip)]" width={8} height={4} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
