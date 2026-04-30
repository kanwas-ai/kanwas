/**
 * Simple delay utility for integration tests.
 */

/**
 * Delay execution for the specified milliseconds.
 */
export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
