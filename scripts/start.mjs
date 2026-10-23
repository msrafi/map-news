// One command to get the local app running: install, sync places, merge any
// downloaded news, then run the map and the feed watcher together.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
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

// Terminals that support OSC 8 turn this into a clickable link; others show the URL.
function link(url, label = url) {
  return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`
}

function localUrl(text) {
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
  const match = text.replace(ansi, '').match(/Local:\s+(https?:\/\/\S+)/)
  return match?.[1] ?? null
}

function openBrowser(url) {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {
    console.log(`Could not open the browser. Click ${link(url)}`)
  })
  child.unref()
}

// Vite picks the real port, so read its "Local:" line instead of assuming 5173.
function startDevServer() {
  const child = spawn(NPM, ['run', 'dev'], {
    cwd: PROJECT,
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })

  let opened = false
  let pending = ''
  const onOutput = (chunk, stream) => {
    const text = chunk.toString()
    stream.write(text)
    if (opened) return
    pending = (pending + text).slice(-800)
    const url = localUrl(pending)
    if (!url) return
    opened = true
    const port = new URL(url).port || (url.startsWith('https') ? '443' : '80')
    console.log(`\nReady on port ${port} — click to open ${link(url)}\n`)
    openBrowser(url)
  }

  child.stdout.on('data', (chunk) => onOutput(chunk, process.stdout))
  child.stderr.on('data', (chunk) => onOutput(chunk, process.stderr))
  return child
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on('exit', () => resolve())
  })
}

const APP = 'http://localhost:5173/'

console.log(`Map News — starting local app
Local:      ${link(APP)}
Port:       5173 (Vite will say if it has to use another)
Feed:       ${path.join(homedir(), 'Downloads', 'map-news')} every 2s
Extension:  chrome://extensions → Developer mode → Load unpacked → extension/

The page opens in your browser once the server is ready. Ctrl+C stops it.
`)

if (!existsSync(path.join(PROJECT, 'node_modules'))) {
  console.log('Installing npm packages…')
  await run(NPM, ['install'])
}

await run(NODE, ['scripts/sync-places.mjs'])

const children = [
  pipe(NODE, ['scripts/merge-downloads.mjs', '--watch']),
  startDevServer(),
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
