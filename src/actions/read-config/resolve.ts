import * as core from '@actions/core'
import { type Document, isScalar } from 'yaml'
import { assertPositiveInteger } from '../../lib/positive-integer.js'
import { type SettingDef, type ValueKind } from './registry.js'

export type Source = 'input' | 'file' | 'default'
export type SettingValue = string | string[] | number | boolean

export interface Resolved {
  value: SettingValue
  source: Source
}

function kindLabel(kind: ValueKind): string {
  if (kind === 'string') return 'a string'
  if (kind === 'string-list') return 'a list of strings'
  if (kind === 'boolean') return 'a boolean'
  return 'a number'
}

function matchesKind(kind: ValueKind, value: unknown): boolean {
  if (kind === 'string') return typeof value === 'string'
  if (kind === 'string-list') {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    )
  }
  if (kind === 'boolean') return typeof value === 'boolean'
  return typeof value === 'number'
}

/**
 * A YAML scalar like `2.10` or `3.0` parses as a number, not the string the
 * maintainer wrote: `String(2.1)` is `"2.1"`, silently dropping the trailing
 * zero. Recover the maintainer's own text from the parsed document instead.
 * Falls back to `String(value)` when there is no source text, for example a
 * value that did not come from a parsed file.
 */
function scalarSourceAt(
  doc: Document | undefined,
  path: string
): string | undefined {
  const node = doc?.getIn(path.split('.'), true)
  return isScalar(node) && typeof node.source === 'string'
    ? node.source
    : undefined
}

/**
 * For a 'string' setting, accept a YAML number or boolean and convert it to
 * text, so an unquoted version in .nf-core.yml still resolves instead of
 * hard-failing. Anything non-scalar (a list, a mapping) is left alone and
 * still fails the kind check below.
 */
function coerceStringScalar(
  kind: ValueKind,
  value: unknown,
  source: string | undefined
): unknown {
  if (
    kind === 'string' &&
    (typeof value === 'number' || typeof value === 'boolean')
  ) {
    return source ?? String(value)
  }
  return value
}

/** Throws if a string-list setting's value is an empty list. Applies to every string-list setting: an empty list never builds a usable matrix. */
function assertNonEmptyList(value: string[], label: string): void {
  if (value.length === 0) {
    throw new Error(`${label} must not be an empty list.`)
  }
}

/** Reads a dot-separated path out of a parsed YAML document. Undefined if any segment is missing. */
export function getAtPath(doc: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (
      node !== null &&
      typeof node === 'object' &&
      !Array.isArray(node) &&
      key in node
    ) {
      return (node as Record<string, unknown>)[key]
    }
    return undefined
  }, doc)
}

// Action inputs are always strings, so a list or number input carries the
// same JSON an output would carry. This keeps one format for both directions.
function parseInput(setting: SettingDef, raw: string): SettingValue {
  if (setting.kind === 'string') return raw

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(
      `Input '${setting.output}' must be valid JSON (${kindLabel(setting.kind)}). Got: ${raw}`
    )
  }
  if (!matchesKind(setting.kind, parsed)) {
    throw new Error(
      `Input '${setting.output}' must be ${kindLabel(setting.kind)}. Got: ${raw}`
    )
  }
  // Every 'number' setting today (max-shards, awsfulltest-required-approvals)
  // needs a positive integer: a shard count of zero or a fraction cannot
  // build a matrix, and an approval count of zero or a fraction can never be
  // reached. If a future number setting legitimately allows zero or a
  // fraction, give it a per-setting constraint instead of loosening this one.
  if (setting.kind === 'number') {
    assertPositiveInteger(parsed as number, `Input '${setting.output}'`)
  }
  // An empty list (for example 'profiles: []') builds a matrix with no
  // entries, or a null shard string, instead of failing loudly.
  if (setting.kind === 'string-list') {
    assertNonEmptyList(parsed as string[], `Input '${setting.output}'`)
  }
  return parsed as SettingValue
}

/**
 * Resolves one setting. A CI setting (no configPath) comes from its action
 * input, then the built-in default; it is never read from .nf-core.yml. A
 * read-only setting comes from .nf-core.yml, then an empty default.
 * Throws on a malformed input or a wrong-typed config value. Never coerces,
 * except for a string setting given an unquoted YAML number or boolean.
 */
export function resolveSetting(
  setting: SettingDef,
  config: unknown,
  doc?: Document
): Resolved {
  if (setting.configPath === undefined) {
    const raw = core.getInput(setting.output)
    if (raw.trim() !== '') {
      const value = parseInput(setting, raw)
      core.info(
        `${setting.output}: using the '${setting.output}' input (wins over the default)`
      )
      return { value, source: 'input' }
    }
    core.info(
      `${setting.output}: no input given, using the default ${JSON.stringify(setting.default)}`
    )
    return { value: setting.default, source: 'default' }
  }

  const rawFileValue = getAtPath(config, setting.configPath)
  if (rawFileValue !== undefined) {
    const source = scalarSourceAt(doc, setting.configPath)
    const fileValue = coerceStringScalar(setting.kind, rawFileValue, source)
    if (fileValue !== rawFileValue) {
      core.info(
        `${setting.configPath}: read as the ${typeof rawFileValue} ${JSON.stringify(rawFileValue)}, not a string. Quote it in .nf-core.yml. Using '${String(fileValue)}'.`
      )
    }

    if (!matchesKind(setting.kind, fileValue)) {
      throw new Error(
        `.nf-core.yml: '${setting.configPath}' must be ${kindLabel(setting.kind)}. Got: ${JSON.stringify(rawFileValue)}`
      )
    }
    core.info(
      `${setting.output}: using '${setting.configPath}' from .nf-core.yml`
    )
    return { value: fileValue as SettingValue, source: 'file' }
  }

  core.warning(
    `'${setting.configPath}' is not set in .nf-core.yml. ${setting.output} defaults to an empty string.`
  )
  return { value: setting.default, source: 'default' }
}

/**
 * Warns when .nf-core.yml still carries a 'ci:' block. CI settings are
 * workflow inputs now, and nothing reads 'ci:' any more: without this
 * warning a pipeline that still sets one would silently get the defaults.
 * `ci:` with no value parses as null and is treated the same as absent.
 */
export function warnIgnoredCiBlock(config: unknown): void {
  const ci = getAtPath(config, 'ci')
  if (ci === undefined || ci === null) return
  // Key names come from the pipeline's .nf-core.yml, a contributor's file
  // on a pull request: JSON-encode them so a key containing a newline
  // can't inject a workflow command into the log (same reasoning as
  // run.ts's resolved-value log line).
  const keys =
    typeof ci === 'object' && !Array.isArray(ci)
      ? ` (${JSON.stringify(Object.keys(ci))})`
      : ''
  core.warning(
    `.nf-core.yml has a 'ci:' block${keys}, which is no longer read. Pass these settings as 'with:' inputs to the reusable workflow instead, then remove 'ci:' from .nf-core.yml.`
  )
}
