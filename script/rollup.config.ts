// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import { discoverActionEntries } from '../src/lib/discover-entries.js'

const entries = discoverActionEntries('src/actions')

// dist/ has no package.json of its own, so Node would otherwise infer the
// module type from the repo root's package.json. Emit one so each bundle
// declares itself as ESM and survives that file changing or being removed.
function emitEsmPackageJson() {
  return {
    name: 'emit-esm-package-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'package.json',
        source: '{"type":"module"}\n'
      })
    }
  }
}

// One config per action. Bundles stay separate so each action's dist/index.js
// only contains the code that action needs.
const config = entries.map(({ name, entry }) => ({
  input: entry,
  output: {
    file: `actions/${name}/dist/index.js`,
    format: 'es'
    // No sourcemap, no minification: dist/ is committed, see .github/CONTRIBUTING.md.
  },
  // noCheck: tsc --noEmit (npm run type-check) owns type-checking, not Rollup.
  plugins: [
    typescript({ noCheck: true }),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    emitEsmPackageJson()
  ]
}))

export default config
