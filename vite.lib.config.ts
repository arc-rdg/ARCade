import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

// Runtime dependencies and optional peers stay out of the bundle, subpaths included.
const external = [/^phaser(\/.*)?$/, /^roughjs(\/.*)?$/, /^react(\/.*)?$/, /^react-dom(\/.*)?$/, /^@nfdi4plants\/arctrl(\/.*)?$/]

// Vite's library mode inlines every asset as base64. The mage becomes one file next to the chunks,
// resolved with new URL(..., import.meta.url), which Vite, webpack 5 and Rollup consumers all follow.
function mageAsFile(): Plugin {
  return {
    name: 'arcade-mage-file',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('.png')) return null
      const ref = this.emitFile({ type: 'asset', fileName: 'ARCMage.png', source: readFileSync(id) })
      return `export default import.meta.ROLLUP_FILE_URL_${ref}`
    },
  }
}

// The shell shows this version on its start screen.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  define: { __ARCADE_VERSION__: JSON.stringify(version) },
  plugins: [mageAsFile()],
  publicDir: false,
  experimental: { renderBuiltUrl: () => ({ relative: true }) },
  build: {
    outDir: path('dist'),
    emptyOutDir: true,
    target: 'es2023',
    lib: {
      formats: ['es'],
      entry: {
        index: path('src/index.ts'),
        react: path('src/react/index.tsx'),
        arc: path('src/arc/index.ts'),
      },
    },
    rollupOptions: {
      external,
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
      },
    },
  },
})
