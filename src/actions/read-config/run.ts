import { readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import * as core from '@actions/core'
import { type Document, parseDocument } from 'yaml'
import { encodeOutput } from '../../lib/encode-output.js'
import { escapeHtml } from '../../lib/escape-html.js'
import { isEnoent } from '../../lib/is-enoent.js'
import { writeSummaryBestEffort } from '../../lib/write-summary.js'
import { DEFAULT_CONFIG_FILE, SETTINGS } from './registry.js'
import {
  resolveSetting,
  warnUnknownCiKeys,
  type SettingValue,
  type Source
} from './resolve.js'

interface Row {
  setting: string
  /** Resolved value, exactly as it will be encoded for setOutput(). */
  value: string
  /** Same value, before output-encoding. Only used for the log line below. */
  raw: SettingValue
  source: Source
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
 * Reads and parses the config file, keeping the yaml `Document` so a
 * 'string' setting can recover a scalar's original source text (see
 * resolve.ts). Undefined if the file does not exist.
 */
function loadConfig(configPath: string): Document | undefined {
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch (error) {
    if (isEnoent(error)) {
      core.warning(
        `No config file found at '${configPath}'. Using the built-in default for every ci setting.`
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
  core.info('Resolved CI settings:')
  for (const row of rows) {
    // A file-sourced value is a contributor's own .nf-core.yml on a pull
    // request: JSON-encode it so a value containing a newline can't inject
    // a workflow command into the log. The summary table below is escaped
    // for HTML separately; this is the log path, which needs its own encoding.
    core.info(`  ${row.setting} = ${JSON.stringify(row.raw)} (${row.source})`)
  }

  core.summary.addHeading('read-config: resolved settings', 3).addTable([
    [
      { data: 'Setting', header: true },
      { data: 'Value', header: true },
      { data: 'Source', header: true }
    ],
    // 'setting' and 'source' are internal, fixed values. 'value' can come
    // from the pipeline's .nf-core.yml, which on a pull request is the
    // contributor's version of that file: addTable() writes cell data as
    // raw HTML, unescaped, so it must be escaped here.
    ...rows.map((row) => [row.setting, escapeHtml(row.value), row.source])
  ])
  return writeSummaryBestEffort()
}

/** Resolves every registry setting and publishes it as an action output and a summary table row. */
export async function run(): Promise<void> {
  const configFileInput = core.getInput('config-file') || DEFAULT_CONFIG_FILE
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const configPath = resolveConfigPath(workspace, configFileInput)

  const doc = loadConfig(configPath)
  const config: unknown = doc?.toJS()
  warnUnknownCiKeys(config)

  // Resolve every setting before writing any output. If one setting fails
  // to resolve, this throws before the loop below writes anything, so a
  // caller never sees a partial set of outputs.
  const rows: Row[] = SETTINGS.map((setting) => {
    const resolved = resolveSetting(setting, config, doc)
    return {
      setting: setting.output,
      value: encodeOutput(resolved.value),
      raw: resolved.value,
      source: resolved.source
    }
  })

  for (const row of rows) {
    core.setOutput(row.setting, row.value)
  }

  await logAndWriteSummary(rows)
}
