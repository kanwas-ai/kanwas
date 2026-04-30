/**
 * Test logger for execenv integration tests.
 * Uses silent level to avoid noise in test output.
 */

import pino from 'pino'

export const testLogger = pino({ level: 'silent' })
