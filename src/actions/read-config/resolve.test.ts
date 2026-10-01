import { describe, expect, it, jest } from '@jest/globals'
import { parseDocument } from 'yaml'
import { METADATA, type MetadataDef } from './registry.js'

const info = jest.fn()
const warning = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({ info, warning }))

const { getAtPath, resolveMetadata } = await import('./resolve.js')

/** Looks up a real registry entry by output name, so these tests can't drift from registry.ts. */
function defByOutput(output: string): MetadataDef {
  const def = METADATA.find((d) => d.output === output)
  if (!def) {
    throw new Error(
      `No entry named '${output}' in the registry. Update this test.`
    )
  }
  return def
}

const nfCoreVersion = defByOutput('nf-core-version')
const pipelineName = defByOutput('pipeline-name')

/** Not a real registry entry; exercises a nested configPath with a number. */
const templateVersion: MetadataDef = {
  output: 'template-version',
  configPath: 'template.version'
}

describe('getAtPath', () => {
  it('reads a nested path', () => {
    expect(getAtPath({ template: { name: 'x' } }, 'template.name')).toBe('x')
  })

  it('returns undefined for a missing path', () => {
    expect(getAtPath({ template: {} }, 'template.name')).toBeUndefined()
  })

  it('returns undefined when an intermediate node is not an object', () => {
    expect(getAtPath({ template: 'nope' }, 'template.name')).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(getAtPath(undefined, 'template.name')).toBeUndefined()
  })
})

describe('resolveMetadata', () => {
  it('reads a string value', () => {
    expect(
      resolveMetadata(pipelineName, { template: { name: 'rnaseq' } })
    ).toBe('rnaseq')
    expect(warning).not.toHaveBeenCalled()
  })

  it('defaults a missing value to an empty string and warns, naming the path', () => {
    expect(resolveMetadata(pipelineName, {})).toBe('')
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('template.name')
    )
  })

  it('rejects a list, naming the path', () => {
    expect(() =>
      resolveMetadata(pipelineName, { template: { name: ['rnaseq'] } })
    ).toThrow(/template\.name.*a string/s)
  })

  it('rejects a mapping', () => {
    const doc = parseDocument('nf_core_version:\n  major: 2')
    expect(() => resolveMetadata(nfCoreVersion, doc.toJS(), doc)).toThrow(
      /nf_core_version/
    )
  })
})

describe('an unquoted YAML scalar', () => {
  it('reads an unquoted version number as the maintainer wrote it, and logs it at info level', () => {
    // YAML parses the unquoted `2.10` as the number 2.1, dropping the
    // trailing zero. nf-core/tools released 2.10 through 2.14, so the fix
    // must recover the original text, not String(2.1) = "2.1".
    const doc = parseDocument('nf_core_version: 2.10')
    expect(resolveMetadata(nfCoreVersion, doc.toJS(), doc)).toBe('2.10')
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('nf_core_version')
    )
  })

  it('reads an unquoted version number at a nested path the same way', () => {
    const doc = parseDocument('template:\n  version: 3.0')
    expect(resolveMetadata(templateVersion, doc.toJS(), doc)).toBe('3.0')
  })

  it('reads an unquoted boolean as its string form', () => {
    const doc = parseDocument('nf_core_version: true')
    expect(resolveMetadata(nfCoreVersion, doc.toJS(), doc)).toBe('true')
  })

  it('falls back to String(value) when there is no document to recover source text from', () => {
    expect(resolveMetadata(nfCoreVersion, { nf_core_version: 2.1 })).toBe('2.1')
  })
})
