import type { UserIdentity } from '@/lib/userIdentity'
import type { ReactFlowInstance } from '@xyflow/react'
import type { WorkspaceSocketProviderInstance } from 'shared'

interface CursorPosition {
  canvasId: string
  x: number
  y: number
  timestamp: number
}

interface CursorManagerOptions {
  isPublishingSuppressed: () => boolean
  userId: string
}

const LOCAL_CURSOR_HIDE_MS = 60_000
const REMOTE_CURSOR_STALE_MS = 90_000

class CursorManager {
  private activeCanvasId: string | null = null
  private container: HTMLElement | null = null
  private cursorsContainer: HTMLDivElement | null = null
  private cursorElements: Map<string, HTMLDivElement> = new Map()
  private cursorExpiryTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private lastUpdate = 0
  private throttleMs = 50
  private hideTimeout: ReturnType<typeof setTimeout> | null = null
  private reactFlowInstance: ReactFlowInstance | null = null
  private provider: WorkspaceSocketProviderInstance
  private readonly isPublishingSuppressed: () => boolean
  private readonly userId: string

  constructor(provider: WorkspaceSocketProviderInstance, options: CursorManagerOptions) {
    this.provider = provider
    this.isPublishingSuppressed = options.isPublishingSuppressed
    this.userId = options.userId
    this.init()
  }

  private init() {
    // Listen for awareness updates
    this.provider.awareness.on('update', this.handleAwarenessUpdate)

    // Hide cursor when mouse leaves window
    window.addEventListener('mouseleave', this.handleMouseLeave)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  private handleAwarenessUpdate = () => {
    if (!this.activeCanvasId) {
      this.clearCursorElements()
      return
    }

    const states = this.provider.awareness.getStates()
    const activeUsers = new Set<string>()

    states.forEach((state) => {
      // Skip if no app user data
      if (!state['appUser']) return

      const user = state['appUser'] as UserIdentity

      // Skip own cursor
      if (user.id === this.userId) {
        return
      }

      activeUsers.add(user.id)
      const cursor = state['appCursor'] as CursorPosition | undefined

      if (cursor && this.isCursorStale(cursor)) {
        this.removeCursorElement(user.id)
      } else if (cursor?.canvasId === this.activeCanvasId) {
        this.updateCursorElement(user, cursor)
      } else {
        this.removeCursorElement(user.id)
      }
    })

    // Remove cursors for users who disconnected
    this.cursorElements.forEach((_, userId) => {
      if (!activeUsers.has(userId)) {
        this.removeCursorElement(userId)
      }
    })
  }

  private createCursorElement(user: UserIdentity): HTMLDivElement {
    const cursorContainer = document.createElement('div')
    cursorContainer.className = 'remote-cursor'
    cursorContainer.style.cssText = `
      position: absolute;
      pointer-events: none;
      transition: left 0.1s linear, top 0.1s linear;
      z-index: 30;
    `

    // Create cursor SVG — polygonal triangle pointer, tip at top-left
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '30')
    svg.setAttribute('height', '30')
    svg.setAttribute('viewBox', '0 0 30 30')
    svg.style.cssText = `
      display: block;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.22));
    `

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('data-cursor-pointer', 'true')
    // Four-point polygon with rounded corners (r≈2) via quadratic curves.
    // Base vertices: P0(2,2) tip, P1(23,13), P2(13,16), P3(9,25).
    path.setAttribute(
      'd',
      'M3.77 2.93 L21.23 12.07 Q23 13 21.08 13.57 L14.92 15.43 Q13 16 12.19 17.83 L9.81 23.17 Q9 25 8.42 23.09 L2.58 3.91 Q2 2 3.77 2.93 Z'
    )
    path.setAttribute('fill', user.color)
    path.setAttribute('stroke', 'white')
    path.setAttribute('stroke-width', '1.8')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('stroke-linecap', 'round')

    svg.appendChild(path)
    cursorContainer.appendChild(svg)

    // Create name label — pill with gradient fill, inside stroke, inner shadow
    const label = document.createElement('div')
    label.className = 'remote-cursor-label'
    label.textContent = user.name
    label.style.cssText = `
      position: absolute;
      top: 18px;
      left: 14px;
      padding: 8px 18px;
      border-radius: 9999px;
      font-size: 18px;
      font-weight: 700;
      line-height: 1;
      white-space: nowrap;
      background: linear-gradient(180deg, color-mix(in srgb, ${user.color} 82%, white) 0%, ${user.color} 100%);
      color: white;
      box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 1),
        inset 0 2px 2px rgba(255, 255, 255, 0.25),
        0 4px 12px rgba(0, 0, 0, 0.2);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      letter-spacing: 0.01em;
    `

    cursorContainer.appendChild(label)
    return cursorContainer
  }

  private syncCursorElementAppearance(element: HTMLDivElement, user: UserIdentity) {
    const path = element.querySelector('[data-cursor-pointer]')
    if (path) {
      path.setAttribute('fill', user.color)
    }

    const label = element.querySelector('.remote-cursor-label')
    if (label instanceof HTMLDivElement) {
      label.textContent = user.name
      label.style.background = `linear-gradient(180deg, color-mix(in srgb, ${user.color} 82%, white) 0%, ${user.color} 100%)`
    }
  }

  private updateCursorElement(user: UserIdentity, cursor: CursorPosition) {
    if (!this.cursorsContainer || !this.container || !this.reactFlowInstance) return

    let element = this.cursorElements.get(user.id)
    if (!element) {
      element = this.createCursorElement(user)
      this.cursorElements.set(user.id, element)
      this.cursorsContainer.appendChild(element)
    }

    this.syncCursorElementAppearance(element, user)

    // Convert flow coordinates to screen coordinates
    const screenPos = this.reactFlowInstance.flowToScreenPosition({
      x: cursor.x,
      y: cursor.y,
    })
    const containerRect = this.container.getBoundingClientRect()

    // The overlay is positioned inside the canvas container, so convert from
    // viewport coordinates back into local container coordinates.
    element.style.left = `${screenPos.x - containerRect.left}px`
    element.style.top = `${screenPos.y - containerRect.top}px`

    this.scheduleCursorExpiry(user.id)
  }

  private removeCursorElement(userId: string) {
    const expiryTimeout = this.cursorExpiryTimeouts.get(userId)
    if (expiryTimeout) {
      clearTimeout(expiryTimeout)
      this.cursorExpiryTimeouts.delete(userId)
    }

    const element = this.cursorElements.get(userId)
    if (element) {
      element.remove()
      this.cursorElements.delete(userId)
    }
  }

  private handleMouseMove = (e: MouseEvent) => {
    const now = Date.now()
    if (now - this.lastUpdate < this.throttleMs) return

    this.lastUpdate = now

    // Don't send cursor updates while canvas presence is explicitly suppressed.
    if (this.isPublishingSuppressed()) return

    if (this.activeCanvasId && this.container && this.reactFlowInstance) {
      // Get the flow position (canvas coordinates)
      const flowPos = this.reactFlowInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      })

      this.provider.awareness.setLocalStateField('appCursor', {
        canvasId: this.activeCanvasId,
        x: flowPos.x,
        y: flowPos.y,
        timestamp: now,
      })

      this.resetLocalCursorHideTimeout()
    }
  }

  private handleMouseLeave = () => {
    this.clearLocalCursorPresence()
  }

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      this.clearLocalCursorPresence()
    }
  }

  setReactFlowInstance(instance: ReactFlowInstance) {
    this.reactFlowInstance = instance
  }

  refresh() {
    this.handleAwarenessUpdate()
  }

  attach(container: HTMLElement, canvasId: string) {
    if (this.container === container && this.activeCanvasId === canvasId && this.cursorsContainer) {
      this.handleAwarenessUpdate()
      return
    }

    this.detach()
    this.container = container
    this.activeCanvasId = canvasId

    // Create cursors container
    this.cursorsContainer = document.createElement('div')
    this.cursorsContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
    `
    container.appendChild(this.cursorsContainer)

    // Add event listeners
    container.addEventListener('mousemove', this.handleMouseMove)
    container.addEventListener('mouseleave', this.handleMouseLeave)

    // Initial update
    this.handleAwarenessUpdate()
  }

  detach() {
    if (this.container) {
      this.container.removeEventListener('mousemove', this.handleMouseMove)
      this.container.removeEventListener('mouseleave', this.handleMouseLeave)
    }

    if (this.cursorsContainer) {
      this.cursorsContainer.remove()
      this.cursorsContainer = null
    }

    this.clearCursorElements()
    this.container = null
    this.activeCanvasId = null
    this.clearLocalCursorPresence()
  }

  private clearCursorElements() {
    this.cursorElements.forEach((_, userId) => {
      this.removeCursorElement(userId)
    })
  }

  private isCursorStale(cursor: CursorPosition) {
    return Date.now() - cursor.timestamp > REMOTE_CURSOR_STALE_MS
  }

  private scheduleCursorExpiry(userId: string) {
    const previousTimeout = this.cursorExpiryTimeouts.get(userId)
    if (previousTimeout) {
      clearTimeout(previousTimeout)
    }

    this.cursorExpiryTimeouts.set(
      userId,
      setTimeout(() => {
        this.removeCursorElement(userId)
      }, REMOTE_CURSOR_STALE_MS)
    )
  }

  private resetLocalCursorHideTimeout() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
    }

    this.hideTimeout = setTimeout(() => {
      this.clearLocalCursorPresence()
    }, LOCAL_CURSOR_HIDE_MS)
  }

  private clearLocalCursorPresence() {
    this.provider.awareness.setLocalStateField('appCursor', null)

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }
  }

  destroy() {
    this.detach()
    this.provider.awareness.off('update', this.handleAwarenessUpdate)
    window.removeEventListener('mouseleave', this.handleMouseLeave)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.clearLocalCursorPresence()
  }
}

export default CursorManager
