import type { ApplicationService } from '@adonisjs/core/types'
import { createAdapter } from '@socket.io/redis-adapter'
import redis from '@adonisjs/redis/services/main'
import server from '@adonisjs/core/services/server'
import InvocationSubscribed from '#events/invocation_subscribed'
import { SocketioServer } from '#contracts/socketio_server'
import { SocketClientEvents } from '#types/socketio'

export default class SocketIOProvider {
  constructor(protected app: ApplicationService) {}

  async register() {
    // Register Socket.IO as a singleton in the container
    if (this.app.getEnvironment() !== 'web') {
      return
    }

    // Bind the abstract SocketioServer contract to the concrete Socket.IO Server implementation
    this.app.container.singleton(SocketioServer, async () => {
      const httpServer = server.getNodeServer()

      if (!httpServer) {
        throw new Error('HTTP server not available')
      }

      const io = new SocketioServer(httpServer, {
        cors: {
          origin: '*',
          credentials: true,
        },
        pingInterval: 20000,
        pingTimeout: 15000,
      })

      // Get the underlying ioredis client from AdonisJS Redis
      const pubClient = redis.connection().ioConnection
      const subClient = pubClient.duplicate()

      io.adapter(createAdapter(pubClient, subClient))

      return io
    })
  }

  /**
   * The application has been started
   */
  async ready() {
    if (this.app.getEnvironment() === 'web') {
      const io = await this.app.container.make(SocketioServer)

      io.on('connection', (socket) => {
        // Handle room joining
        socket.on(SocketClientEvents.JOIN_ROOM, (channel: string) => {
          socket.join(channel)

          // Check if channel matches pattern agent/{invocationId}/events
          const match = channel.match(/^agent\/([^/]+)\/events$/)
          if (match) {
            const invocationId = match[1]
            InvocationSubscribed.dispatch(invocationId, channel, socket.id)
          }
        })

        // Handle room leaving
        socket.on(SocketClientEvents.LEAVE_ROOM, (channel: string) => {
          socket.leave(channel)
        })
      })
    }
  }

  /**
   * Gracefully close Socket.IO connections
   */
  async shutdown() {
    if (this.app.getEnvironment() === 'web') {
      const io = await this.app.container.make(SocketioServer)
      await io.close()
    }
  }
}
