import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { parseDocument } from 'yaml'
import type { SettingDef } from './registry.js'
import { defineSetting, SETTINGS } from './registry.js'

const getInput = jest.fn<(name: string) => string>()
const info = jest.fn()
const warning = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  getInput,
  info,
  warning
}))

const { getAtPath, resolveSetting, warnUnknownCiKeys } =
  await import('./resolve.js')

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
const runnerSetting = settingByOutput('runner')

/** Not a real registry setting; exercises a nested configPath. */
const templateVersionSetting = defineSetting({
  output: 'template-version',
  configPath: 'template.version',
  kind: 'string',
  default: '',
  hasInput: false
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
  it('input wins over file and default, and logs it at info level', () => {
    getInput.mockReturnValue('0.9.9')
    const result = resolveSetting(stringSetting, {
      ci: { nf_test_version: '1.0.0' }
    })
    expect(result).toEqual({ value: '0.9.9', source: 'input' })
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('nf-test-version')
    )
    expect(warning).not.toHaveBeenCalled()
  })

  it('file wins over default, and logs it at info level', () => {
    const result = resolveSetting(stringSetting, {
      ci: { nf_test_version: '1.0.0' }
    })
    expect(result).toEqual({ value: '1.0.0', source: 'file' })
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('nf-test-version')
    )
    expect(warning).not.toHaveBeenCalled()
  })

  it('falls back to the default and warns, naming the setting and the default', () => {
    const result = resolveSetting(stringSetting, undefined)
    expect(result).toEqual({ value: '0.9.5', source: 'default' })
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('nf-test-version')
    )
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('0.9.5'))
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
})

describe('value kinds', () => {
  it('parses a string-list from YAML', () => {
    const result = resolveSetting(listSetting, {
      ci: { profiles: ['docker', 'singularity'] }
    })
    expect(result).toEqual({
      value: ['docker', 'singularity'],
      source: 'file'
    })
  })

  it('parses a number from YAML', () => {
    const result = resolveSetting(numberSetting, { ci: { max_shards: 5 } })
    expect(result).toEqual({ value: 5, source: 'file' })
  })

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

  it('rejects a config value of the wrong type, naming the setting and both kinds', () => {
    expect(() =>
      resolveSetting(numberSetting, { ci: { max_shards: 'many' } })
    ).toThrow(/ci\.max_shards.*a number.*many/s)
  })

  it('rejects a list-shaped setting given a scalar', () => {
    expect(() =>
      resolveSetting(listSetting, { ci: { profiles: 'docker' } })
    ).toThrow(/ci\.profiles/)
  })

  it('parses a boolean from YAML', () => {
    const result = resolveSetting(booleanSetting, {
      ci: { nextflow_lint: true }
    })
    expect(result).toEqual({ value: true, source: 'file' })
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

  it('rejects a non-boolean config value, naming the setting and the kind', () => {
    expect(() =>
      resolveSetting(booleanSetting, { ci: { nextflow_lint: 'yes' } })
    ).toThrow(/ci\.nextflow_lint.*a boolean.*yes/s)
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
  it('rejects zero from the config file', () => {
    expect(() =>
      resolveSetting(numberSetting, { ci: { max_shards: 0 } })
    ).toThrow(/max_shards.*positive integer/s)
  })

  it('rejects a negative number from the config file', () => {
    expect(() =>
      resolveSetting(numberSetting, { ci: { max_shards: -1 } })
    ).toThrow(/positive integer/)
  })

  it('rejects a fraction from the config file', () => {
    expect(() =>
      resolveSetting(numberSetting, { ci: { max_shards: 2.5 } })
    ).toThrow(/positive integer/)
  })

  it('rejects zero from the input', () => {
    getInput.mockReturnValue('0')
    expect(() => resolveSetting(numberSetting, undefined)).toThrow(
      /positive integer/
    )
  })
})

describe('kind: string-list requires a non-empty list', () => {
  it('rejects an empty list from the config file, naming the setting and the file', () => {
    expect(() => resolveSetting(listSetting, { ci: { profiles: [] } })).toThrow(
      /ci\.profiles.*empty list/s
    )
  })

  it('rejects an empty list from the input', () => {
    getInput.mockReturnValue('[]')
    expect(() => resolveSetting(listSetting, undefined)).toThrow(
      /profiles.*empty list/s
    )
  })
})

describe('runner must not be blank', () => {
  it('rejects an empty string from the config file, naming the setting and the file', () => {
    expect(() => resolveSetting(runnerSetting, { ci: { runner: '' } })).toThrow(
      /ci\.runner.*must not be empty/s
    )
  })

  it('rejects a whitespace-only string from the config file', () => {
    expect(() =>
      resolveSetting(runnerSetting, { ci: { runner: '   ' } })
    ).toThrow(/must not be empty/)
  })

  it('a blank runner input is treated as not set, and falls through to the file value', () => {
    getInput.mockReturnValue('   ')
    const result = resolveSetting(runnerSetting, { ci: { runner: '8cpu' } })
    expect(result).toEqual({ value: '8cpu', source: 'file' })
  })
})

describe('warnUnknownCiKeys', () => {
  it('warns and lists unknown keys under ci', () => {
    warnUnknownCiKeys({ ci: { max_shard: 5, nf_test_version: '1.0.0' } })
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('max_shard'))
  })

  it('does not warn when every key is known', () => {
    warnUnknownCiKeys({ ci: { max_shards: 5 } })
    expect(warning).not.toHaveBeenCalled()
  })

  it('does not warn when ci is absent', () => {
    warnUnknownCiKeys({})
    expect(warning).not.toHaveBeenCalled()
  })

  it('does not throw when ci: has no value (parses as null)', () => {
    expect(() => warnUnknownCiKeys({ ci: null })).not.toThrow()
  })

  it('throws when ci is a scalar instead of a mapping', () => {
    expect(() => warnUnknownCiKeys({ ci: 'oops' })).toThrow(/'ci'/)
  })

  it('throws when ci is a list instead of a mapping', () => {
    expect(() => warnUnknownCiKeys({ ci: ['oops'] })).toThrow(/'ci'/)
  })
})
