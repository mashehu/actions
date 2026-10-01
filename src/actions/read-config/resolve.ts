import * as core from '@actions/core'
import { type Document, isScalar } from 'yaml'
import type { MetadataDef } from './registry.js'

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

/**
 * A YAML scalar like `2.10` or `3.0` parses as a number, not the string the
 * maintainer wrote: `String(2.1)` is `"2.1"`, silently dropping the trailing
 * zero. Recover the maintainer's own text from the parsed document instead.
 * Undefined when there is no source text, for example a value that did not
 * come from a parsed file.
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
 * Reads one metadata value from .nf-core.yml. An unquoted YAML number or
 * boolean is accepted and converted to the text the maintainer wrote, so an
 * unquoted version still resolves. Anything else that is not a string (a
 * list, a mapping) throws. A missing value resolves to an empty string,
 * with a warning: callers guard it before use.
 */
export function resolveMetadata(
  def: MetadataDef,
  config: unknown,
  doc?: Document
): string {
  const raw = getAtPath(config, def.configPath)
  if (raw === undefined) {
    core.warning(
      `'${def.configPath}' is not set in .nf-core.yml. ${def.output} defaults to an empty string.`
    )
    return ''
  }
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    const value = scalarSourceAt(doc, def.configPath) ?? String(raw)
    core.info(
      `${def.configPath}: read as the ${typeof raw} ${JSON.stringify(raw)}, not a string. Quote it in .nf-core.yml. Using '${value}'.`
    )
    return value
  }
  throw new Error(
    `.nf-core.yml: '${def.configPath}' must be a string. Got: ${JSON.stringify(raw)}`
  )
}
