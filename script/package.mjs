#!/usr/bin/env node

// Builds every action under src/actions/*.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { discoverActionEntries } from '../src/lib/discover-entries.ts'

// Resolve every path from this file's own location, not process.cwd(), so
// running the script from another directory can't change the outcome.
const repoRoot = join(import.meta.dirname, '..')
const srcDir = join(repoRoot, 'src/actions')
const rollupConfig = join(repoRoot, 'script/rollup.config.ts')
const rollupBin = join(repoRoot, 'node_modules/rollup/dist/bin/rollup')

const subdirs = listSubdirectories(srcDir)

const entries = discoverActionEntries(srcDir)
const buildable = new Set(entries.map((entry) => entry.name))
const missing = subdirs.filter((name) => !buildable.has(name))

if (missing.length > 0) {
  console.error(
    `::error::These src/actions subdirectories have no index.ts: ${missing.join(', ')}`
  )
  process.exit(1)
}

// A source-only action builds and passes CI, then fails at run time with
// "Can't find 'action.yml'" the first time a pipeline calls it.
const actionsDir = join(repoRoot, 'actions')
const missingActionYml = entries
  .map((entry) => entry.name)
  .filter((name) => !existsSync(join(actionsDir, name, 'action.yml')))

if (missingActionYml.length > 0) {
  console.error(
    `::error::These actions have no actions/<name>/action.yml: ${missingActionYml.join(', ')}`
  )
  process.exit(1)
}

if (!existsSync(rollupBin)) {
  console.error(
    '::error::Local Rollup binary not found at node_modules/rollup/dist/bin/rollup. Run npm ci.'
  )
  process.exit(1)
}

// Run the local Rollup directly. Going through npx can silently fetch a
// different Rollup version and does not launch npx.cmd on Windows.
const result = spawnSync(
  process.execPath,
  [
    rollupBin,
    '--config',
    rollupConfig,
    '--configPlugin',
    '@rollup/plugin-typescript'
  ],
  { stdio: 'inherit', cwd: repoRoot }
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)

/** Names of the direct subdirectories of `dir`. Empty if `dir` does not exist. */
function listSubdirectories(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}
