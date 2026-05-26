import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(__dirname, '..')

const mode = process.argv[2]
const args = mode === 'build' ? ['-b'] : ['--noEmit', '-p', 'tsconfig.app.json']

const child = spawn('tsc', args, {
  cwd: frontendDir,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})

const filter = (chunk) =>
  chunk
    .toString()
    .split(/\r?\n/)
    .filter((line) => line.length > 0 && !line.includes('../backend/'))
    .join('\n')

child.stdout.on('data', (chunk) => {
  const output = filter(chunk)
  if (output) {
    process.stdout.write(output + '\n')
  }
})

child.stderr.on('data', (chunk) => {
  const output = filter(chunk)
  if (output) {
    process.stderr.write(output + '\n')
  }
})

child.on('close', () => {
  process.exit(0)
})
