import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(__dirname, '..')
const source = path.join(frontendDir, 'public', 'favicon.png')
const targetDir = path.join(frontendDir, 'dist', 'assets')
const target = path.join(targetDir, 'favicon.png')

fs.mkdirSync(targetDir, { recursive: true })
fs.copyFileSync(source, target)
