import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const CSP = [
  "default-src 'self'",
  "connect-src 'self' https://git.nfdi4plants.org https://gitlab.plantmicrobe.de https://s3.bwsfs.uni-freiburg.de",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

// Only in the production build: the dev server needs inline scripts (React refresh) and a websocket.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'arcade-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  }
}

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

const { version } = JSON.parse(readFileSync(path('../package.json'), 'utf8')) as { version: string }

export default defineConfig({
  define: { __ARCADE_VERSION__: JSON.stringify(version) },
  root: path('.'),
  base: '/ARCade/',
  publicDir: path('../public'),
  plugins: [react(), contentSecurityPolicy()],
  resolve: {
    alias: [
      { find: /^@arc-rdg\/arcade\/arc$/, replacement: path('../src/arc/index.ts') },
      { find: /^@arc-rdg\/arcade$/, replacement: path('../src/index.ts') },
    ],
  },
  build: { outDir: path('../dist-site'), emptyOutDir: true },
})
