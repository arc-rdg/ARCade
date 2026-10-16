import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

// Bundles the declarations into one .d.ts per entry, so they carry no extensionless relative imports.
export default defineConfig({
  input: { index: 'src/index.ts', react: 'src/react/index.tsx', arc: 'src/arc/index.ts' },
  external: [/^phaser(\/.*)?$/, /^roughjs(\/.*)?$/, /^react(\/.*)?$/, /^react-dom(\/.*)?$/, /^@nfdi4plants\/arctrl(\/.*)?$/],
  plugins: [dts({ emitDtsOnly: true, tsconfig: 'tsconfig.lib.json' })],
  output: { dir: 'dist', format: 'es' },
})
