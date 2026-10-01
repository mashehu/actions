import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { parseDocument } from 'yaml'
import type { SettingDef } from '../../src/actions/read-config/registry.js'
import {
  defineSetting,
  SETTINGS
} from '../../src/actions/read-config/registry.js'

const getInput = jest.fn<(name: string) => string>()
const info = jest.fn()
const warning = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  getInput,
  info,
  warning
}))

const { getAtPath, resolveSetting, warnIgnoredCiBlock } =
  await import('../../src/actions/read-config/resolve.js')

/** Looks up a real registry entry by output name, so these tests can't drift from registry.ts. */
function settingByOutput(output: string): SettingDef {
  const setting = SETTINGS.find((s) => s.output === output)
  if (!setting) {
    throw new Error(
      `No setting named '${output}' in the registry. Update this test.`
    )
  }
  return setting
}

const stringSetting = settingByOutput('nf-test-version')
const listSetting = settingByOutput('profiles')
const numberSetting = settingByOutput('max-shards')
const booleanSetting = settingByOutput('nextflow-lint')
const readOnlySetting = settingByOutput('pipeline-name')
const nfCoreVersionSetting = settingByOutput('nf-core-version')

/** Not a real registry setting; exercises a nested configPath. */
const templateVersionSetting = defineSetting({
  output: 'template-version',
  configPath: 'template.version',
  kind: 'string',
  default: ''
})

beforeEach(() => {
  getInput.mockReturnValue('')
})

describe('getAtPath', () => {
  it('reads a nested path', () => {
    expect(getAtPath({ ci: { max_shards: 5 } }, 'ci.max_shards')).toBe(5)
  })

  it('returns undefined for a missing path', () => {
    expect(getAtPath({ ci: {} }, 'ci.max_shards')).toBeUndefined()
  })

  it('returns undefined when an intermediate node is not an object', () => {
    expect(getAtPath({ ci: 'nope' }, 'ci.max_shards')).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(getAtPath(undefined, 'ci.max_shards')).toBeUndefined()
  })
})

describe('resolveSetting precedence', () => {
  it('input wins over the default, and logs it at info level', () => {
    getInput.mockReturnValue('0.9.9')
    const result = resolveSetting(stringSetting, undefined)
    expect(result).toEqual({ value: '0.9.9', source: 'input' })
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('nf-test-version')
    )
    expect(warning).not.toHaveBeenCalled()
  })

  it('never reads a CI setting from the config file', () => {
    const result = resolveSetting(stringSetting, {
      ci: { nf_test_version: '1.0.0' },
      nf_test_version: '1.0.0'
    })
    expect(result).toEqual({ value: '0.9.5', source: 'default' })
  })

  it('falls back to the default at info level, naming the setting and the default', () => {
    const result = resolveSetting(stringSetting, undefined)
    expect(result).toEqual({ value: '0.9.5', source: 'default' })
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('nf-test-version')
    )
    expect(info).toHaveBeenCalledWith(expect.stringContaining('0.9.5'))
    expect(warning).not.toHaveBeenCalled()
  })

  it('treats a blank input as not set', () => {
    getInput.mockReturnValue('   ')
    const result = resolveSetting(stringSetting, undefined)
    expect(result).toEqual({ value: '0.9.5', source: 'default' })
  })

  it('a read-only setting with no matching path defaults to an empty string and warns', () => {
    const result = resolveSetting(readOnlySetting, {})
    expect(result).toEqual({ value: '', source: 'default' })
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('template.name')
    )
  })

  it('a read-only setting never checks an action input', () => {
    getInput.mockReturnValue('should-be-ignored')
    const result = resolveSetting(readOnlySetting, {
      template: { name: 'rnaseq' }
    })
    expect(result.value).toBe('rnaseq')
    expect(result.source).toBe('file')
  })

  it('rejects a read-only config value of the wrong type, naming the path', () => {
    expect(() =>
      resolveSetting(readOnlySetting, { template: { name: ['rnaseq'] } })
    ).toThrow(/template\.name.*a string/s)
  })
})

describe('value kinds', () => {
  it('parses a string-list input as JSON', () => {
    getInput.mockReturnValue('["docker","singularity"]')
    const result = resolveSetting(listSetting, undefined)
    expect(result.value).toEqual(['docker', 'singularity'])
    expect(result.source).toBe('input')
  })

  it('parses a number input as JSON', () => {
    getInput.mockReturnValue('7')
    const result = resolveSetting(numberSetting, undefined)
    expect(result.value).toBe(7)
    expect(result.source).toBe('input')
  })

  it('rejects a malformed JSON input', () => {
    getInput.mockReturnValue('not json')
    expect(() => resolveSetting(numberSetting, undefined)).toThrow(/max-shards/)
  })

  it('rejects a list-shaped input given a scalar', () => {
    getInput.mockReturnValue('"docker"')
    expect(() => resolveSetting(listSetting, undefined)).toThrow(
      /profiles.*a list of strings/s
    )
  })

  it('defaults a boolean setting to false when unset', () => {
    const result = resolveSetting(booleanSetting, {})
    expect(result).toEqual({ value: false, source: 'default' })
  })

  it('parses a boolean input as JSON', () => {
    getInput.mockReturnValue('true')
    const result = resolveSetting(booleanSetting, undefined)
    expect(result).toEqual({ value: true, source: 'input' })
  })

  it('rejects a non-boolean input', () => {
    getInput.mockReturnValue('"yes"')
    expect(() => resolveSetting(booleanSetting, undefined)).toThrow(
      /nextflow-lint.*a boolean/s
    )
  })
})

describe('a string setting given an unquoted YAML scalar', () => {
  it('reads an unquoted version number as the maintainer wrote it, and logs it at info level', () => {
    // YAML parses the unquoted `2.10` as the number 2.1, dropping the
    // trailing zero. nf-core/tools released 2.10 through 2.14, so the fix
    // must recover the original text, not String(2.1) = "2.1".
    const doc = parseDocument('nf_core_version: 2.10')
    const result = resolveSetting(nfCoreVersionSetting, doc.toJS(), doc)
    expect(result).toEqual({ value: '2.10', source: 'file' })
    expect(result.value).not.toBe('2.1')
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('nf_core_version')
    )
  })

  it('reads an unquoted version number at a nested path the same way', () => {
    const doc = parseDocument('template:\n  version: 3.0')
    const result = resolveSetting(templateVersionSetting, doc.toJS(), doc)
    expect(result).toEqual({ value: '3.0', source: 'file' })
  })

  it('reads an unquoted boolean as its string form', () => {
    const doc = parseDocument('nf_core_version: true')
    const result = resolveSetting(nfCoreVersionSetting, doc.toJS(), doc)
    expect(result).toEqual({ value: 'true', source: 'file' })
  })

  it('still resolves a quoted version to exactly what was written', () => {
    const doc = parseDocument("nf_core_version: '4.0.3'")
    const result = resolveSetting(nfCoreVersionSetting, doc.toJS(), doc)
    expect(result).toEqual({ value: '4.0.3', source: 'file' })
  })

  it('still rejects a list where a string is expected', () => {
    const doc = parseDocument('nf_core_version: [2, 10]')
    expect(() => resolveSetting(nfCoreVersionSetting, doc.toJS(), doc)).toThrow(
      /nf_core_version/
    )
  })

  it('still rejects a mapping where a string is expected', () => {
    const doc = parseDocument('nf_core_version:\n  major: 2')
    expect(() => resolveSetting(nfCoreVersionSetting, doc.toJS(), doc)).toThrow(
      /nf_core_version/
    )
  })

  it('falls back to String(value) when there is no document to recover source text from', () => {
    // For example a value built in code rather than parsed from a file.
    const result = resolveSetting(nfCoreVersionSetting, {
      nf_core_version: 2.1
    })
    expect(result).toEqual({ value: '2.1', source: 'file' })
  })
})

describe('kind: number requires a positive integer', () => {
  it('rejects zero', () => {
    getInput.mockReturnValue('0')
    expect(() => resolveSetting(numberSetting, undefined)).toThrow(
      /max-shards.*positive integer/s
    )
  })

  it('rejects a negative number', () => {
    getInput.mockReturnValue('-1')
    expect(() => resolveSetting(numberSetting, undefined)).toThrow(
      /positive integer/
    )
  })

  it('rejects a fraction', () => {
    getInput.mockReturnValue('2.5')
    expect(() => resolveSetting(numberSetting, undefined)).toThrow(
      /positive integer/
    )
  })
})

describe('kind: string-list requires a non-empty list', () => {
  it('rejects an empty list', () => {
    getInput.mockReturnValue('[]')
    expect(() => resolveSetting(listSetting, undefined)).toThrow(
      /profiles.*empty list/s
    )
  })
})

describe('warnIgnoredCiBlock', () => {
  it('warns, listing the keys, when ci: is still present', () => {
    warnIgnoredCiBlock({ ci: { max_shards: 5, nf_test_version: '1.0.0' } })
    expect(warning).toHaveBeenCalledWith(
      expect.stringMatching(/max_shards.*no longer read/s)
    )
  })

  it('warns, without throwing, when ci is not a mapping', () => {
    expect(() => warnIgnoredCiBlock({ ci: 'oops' })).not.toThrow()
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('no longer read')
    )
  })

  it('does not warn when ci is absent', () => {
    warnIgnoredCiBlock({})
    expect(warning).not.toHaveBeenCalled()
  })

  it('does not warn when ci: has no value (parses as null)', () => {
    warnIgnoredCiBlock({ ci: null })
    expect(warning).not.toHaveBeenCalled()
  })
})
