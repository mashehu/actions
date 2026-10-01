import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import * as core from '@actions/core'
import { type Document, parseDocument } from 'yaml'
import { escapeHtml } from '../../lib/escape-html.js'
import { isEnoent } from '../../lib/is-enoent.js'
import { writeSummaryBestEffort } from '../../lib/write-summary.js'
import { DEFAULT_CONFIG_FILE, METADATA } from './registry.js'
import { resolveMetadata } from './resolve.js'

interface Row {
  output: string
  value: string
}

/**
 * Resolves 'config-file' against the workspace and rejects a path that
 * escapes it, so a caller can't read an arbitrary file on the runner
 * (SECURITY.md's trust boundary: this repo reads only what it's told to,
 * from where it's told to).
 */
function resolveConfigPath(workspace: string, configFileInput: string): string {
  if (isAbsolute(configFileInput)) {
    throw new Error(
      `config-file must be a path relative to the workspace. Got an absolute path: '${configFileInput}'`
    )
  }

  const configPath = resolve(workspace, configFileInput)
  const relPath = relative(workspace, configPath)
  // relPath.startsWith('..') would also reject a legitimate file whose name
  // happens to start with two dots (for example '..nf-core.yml'): compare
  // against '..' exactly, or '..' followed by a path separator, not a prefix.
  if (
    relPath === '..' ||
    relPath.startsWith(`..${sep}`) ||
    isAbsolute(relPath)
  ) {
    throw new Error(
      `config-file must stay inside the workspace. '${configFileInput}' resolves outside it.`
    )
  }
  return configPath
}

/**
 * Reads and parses the config file, keeping the yaml `Document` so an
 * unquoted scalar's original source text can be recovered (see
 * resolve.ts). Undefined if the file does not exist.
 */
function loadConfig(configPath: string): Document | undefined {
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch (error) {
    if (isEnoent(error)) {
      core.warning(
        `No config file found at '${configPath}'. Every output resolves to an empty string.`
      )
      return undefined
    }
    throw error
  }

  // parseDocument() never throws on malformed YAML; it collects errors on
  // the document instead. Throw here so a bad file still fails loudly.
  const doc = parseDocument(raw)
  const [firstError] = doc.errors
  if (firstError) {
    throw new Error(
      `Failed to parse '${configPath}' as YAML: ${firstError.message}`,
      { cause: firstError }
    )
  }
  return doc
}

function logAndWriteSummary(rows: Row[]): Promise<void> {
  core.info('Pipeline metadata from .nf-core.yml:')
  for (const row of rows) {
    // Every value is a contributor's own .nf-core.yml on a pull request:
    // JSON-encode it so a value containing a newline can't inject a
    // workflow command into the log (same reasoning as run-nf-test.ts,
    // plan-run and validate-patch). The summary table below is escaped for
    // HTML separately; this is the log path, which needs its own encoding.
    core.info(`  ${row.output} = ${JSON.stringify(row.value)}`)
  }

  core.summary.addHeading('read-config: pipeline metadata', 3).addTable([
    [
      { data: 'Output', header: true },
      { data: 'Value', header: true }
    ],
    // 'output' is an internal, fixed value. 'value' comes from the
    // pipeline's .nf-core.yml, which on a pull request is the contributor's
    // version of that file: addTable() writes cell data as raw HTML,
    // unescaped, so it must be escaped here.
    ...rows.map((row) => [row.output, escapeHtml(row.value)])
  ])
  return writeSummaryBestEffort()
}

/** Reads every registry value and publishes it as an action output and a summary table row. */
export async function run(): Promise<void> {
  const configFileInput = core.getInput('config-file') || DEFAULT_CONFIG_FILE
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const configPath = resolveConfigPath(workspace, configFileInput)

  const doc = loadConfig(configPath)
  const config: unknown = doc?.toJS()

  // Resolve every value before writing any output. If one fails to
  // resolve, this throws before the loop below writes anything, so a
  // caller never sees a partial set of outputs.
  const rows: Row[] = METADATA.map((def) => ({
    output: def.output,
    value: resolveMetadata(def, config, doc)
  }))

  for (const row of rows) {
    core.setOutput(row.output, row.value)
  }

  await logAndWriteSummary(rows)
}
