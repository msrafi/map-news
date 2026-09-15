// One command to get the local app running: install, sync places, merge any
// downloaded news, then run the map and the feed watcher together.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PROJECT = fileURLToPath(new URL('..', import.meta.url))
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const NODE = process.execPath

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: PROJECT,
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} ${signal ?? `exited ${code}`}`))
    })
  })
}

function pipe(command, args) {
  return spawn(command, args, {
    cwd: PROJECT,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on('exit', () => resolve())
  })
}

console.log('Map News — starting local app')

if (!existsSync(path.join(PROJECT, 'node_modules'))) {
  console.log('Installing npm packages…')
  await run(NPM, ['install'])
}

await run(NODE, ['scripts/sync-places.mjs'])
await run(NODE, ['scripts/merge-downloads.mjs'])

console.log(`
App:        http://localhost:5173
Feed:       watching Downloads every 10s
Extension:  chrome://extensions → Developer mode → Load unpacked → extension/
            Open https://x.com/FirstSquawk with Auto-export every minute on.

Ctrl+C stops both the map and the feed watcher.
`)

const children = [
  pipe(NODE, ['scripts/merge-downloads.mjs', '--watch']),
  pipe(NPM, ['run', 'dev']),
]

let shuttingDown = false
function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill(signal)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message)
    shutdown()
  })
  child.on('exit', (code) => {
    if (shuttingDown) return
    if (code) process.exitCode = code
    shutdown()
  })
}

await Promise.all(children.map(waitForExit))
