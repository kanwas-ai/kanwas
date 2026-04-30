import { createTuyau } from '@tuyau/client'
import { io, Socket } from 'socket.io-client'
import { api } from 'backend/api'
import { SocketClientEvents } from 'backend/socketio'
import { getOrCreateCorrelationId, setCorrelationId } from '@/lib/correlation-id'

type Routes = typeof api.routes

type SplitName<T extends string> = T extends `${infer Resource}s.${infer Action}`
  ? { resource: Capitalize<Resource>; action: Action }
  : { error: 'Cannot parse resource' }

type ExtendRoutes<R> = R extends Routes[number] ? R & SplitName<R['name']> : never

type VerbosedRoutes = ExtendRoutes<Routes[number]>

type ShowRoutes = Extract<VerbosedRoutes, { action: 'show' }>
type IndexRoutes = Extract<VerbosedRoutes, { action: 'index' }>

type ExtractResponce<T extends VerbosedRoutes, R extends string> =
  Extract<T, { resource: R }> extends infer Match extends { types: { response: unknown } }
    ? Awaited<Match['types']['response']>
    : never

type GetSucessResponse<T> = T extends { '200': infer Success } ? Success : never

export type Entities = {
  [Resource in ShowRoutes['resource']]: GetSucessResponse<ExtractResponce<ShowRoutes, Resource>>
}
export type Lists = {
  [Resource in IndexRoutes['resource']]: GetSucessResponse<ExtractResponce<IndexRoutes, Resource>>
}

export type Workspace = Entities['Workspace']
let accessToken: string | null = null

export function setAuthToken(token: string | null) {
  accessToken = token
}

export const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3333'

export const tuyau = createTuyau({
  api,
  baseUrl: baseURL,
  hooks: {
    beforeRequest: [
      (request) => {
        // Send correlation ID with every request
        const correlationId = getOrCreateCorrelationId()
        request.headers.set('x-correlation-id', correlationId)

        if (accessToken) {
          request.headers.set('Authorization', `Bearer ${accessToken}`)
        } else {
          request.headers.delete('Authorization')
        }
      },
    ],
    afterResponse: [
      (response) => {
        // Capture correlation ID from response (in case backend generated a new one)
        const correlationId = response.headers.get('x-correlation-id')
        if (correlationId) {
          setCorrelationId(correlationId)
        }
      },
    ],
  },
})

export const socket: Socket = io(baseURL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  query: {
    correlationId: getOrCreateCorrelationId(),
  },
})

const joinedRooms = new Map<string, number>()

export function joinRoom(channel: string) {
  const currentCount = joinedRooms.get(channel) ?? 0
  joinedRooms.set(channel, currentCount + 1)

  if (currentCount === 0 && socket.connected) {
    socket.emit(SocketClientEvents.JOIN_ROOM, channel)
  }
}

export function leaveRoom(channel: string) {
  const currentCount = joinedRooms.get(channel)
  if (!currentCount) {
    return
  }

  if (currentCount <= 1) {
    joinedRooms.delete(channel)
    if (socket.connected) {
      socket.emit(SocketClientEvents.LEAVE_ROOM, channel)
    }
    return
  }

  joinedRooms.set(channel, currentCount - 1)
}

socket.on('connect', () => {
  for (const channel of joinedRooms.keys()) {
    socket.emit(SocketClientEvents.JOIN_ROOM, channel)
  }
})
