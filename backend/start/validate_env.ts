/*
|--------------------------------------------------------------------------
| Environment validation
|--------------------------------------------------------------------------
|
| This file validates that all required environment variables are set
| with non-empty values. If any are missing, the server will fail to start
| with a clear error message.
|
*/

interface RequiredEnvVar {
  name: string
  description: string
  getValue: () => string | undefined
}

// Core required env vars are enforced by the schema in `start/env.ts`.
// (Agent/cloud-provider keys were removed together with the built-in agent.)
const requiredEnvVars: RequiredEnvVar[] = []

function validateEnvironment(): void {
  const missing: RequiredEnvVar[] = []

  for (const envVar of requiredEnvVars) {
    const value = envVar.getValue()
    if (!value || value.trim() === '') {
      missing.push(envVar)
    }
  }

  if (missing.length > 0) {
    console.error('\n' + '='.repeat(70))
    console.error('ERROR: Missing required environment variables')
    console.error('='.repeat(70) + '\n')

    for (const envVar of missing) {
      console.error(`  ✗ ${envVar.name}`)
      console.error(`    ${envVar.description}\n`)
    }

    console.error('-'.repeat(70))
    console.error('Please set these variables in your .env file or environment.')
    console.error('See .env.example for reference values.')
    console.error('-'.repeat(70) + '\n')

    process.exit(1)
  }
}

validateEnvironment()
