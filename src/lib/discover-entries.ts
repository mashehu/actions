// Import only from `node:` here. script/package.mjs loads this file through
// Node type stripping, which does not rewrite import specifiers, so a
// relative import would resolve at type-check time but fail at run time.
import { globSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface ActionEntry {
  /** Directory name of the action, for example 'validate-patch'. */
  name: string
  /** Path to the action's entry file. */
  entry: string
}

/**
 * Find each action's entry point, sorted by name for deterministic build order.
 * An action is a direct subdirectory of `srcDir` that contains an `index.ts` file.
 * Returns an empty list if `srcDir` does not exist yet.
 */
export function discoverActionEntries(srcDir: string): ActionEntry[] {
  // Match relative to `srcDir` rather than building an absolute pattern.
  // A checkout path can contain glob characters, for example a runner
  // directory named `_work[1]`, and those would break the pattern.
  return globSync('*/index.ts', { cwd: srcDir })
    .map((match) => ({
      name: dirname(match),
      entry: join(srcDir, match)
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
