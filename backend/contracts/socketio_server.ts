import { Server } from 'socket.io'

/**
 * Socket.IO server contract for dependency injection
 *
 * This abstract class serves as a contract/interface for the Socket.IO server,
 * following Hexagonal Architecture principles (Port and Adapter pattern).
 *
 * By using this contract, we create an abstraction layer that:
 * - Makes the code more testable (easier to mock)
 * - Provides better semantic naming
 * - Follows AdonisJS container binding patterns
 */
export class SocketioServer extends Server {}

// Re-export the Server type for convenience
export type { Server }
