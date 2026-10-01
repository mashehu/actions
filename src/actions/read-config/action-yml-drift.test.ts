import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@jest/globals'
import { parse } from 'yaml'
import { DEFAULT_CONFIG_FILE, SETTINGS } from './registry.js'

interface ActionYaml {
  inputs?: Record<string, { default?: unknown }>
  outputs?: Record<string, unknown>
}

const actionYmlPath = join(
  import.meta.dirname,
  '../../../actions/read-config/action.yml'
)
const actionYaml = parse(readFileSync(actionYmlPath, 'utf8')) as ActionYaml

describe('action.yml matches the settings registry', () => {
  it('declares exactly one input per configurable setting, plus config-file', () => {
    const expectedInputs = new Set([
      'config-file',
      ...SETTINGS.filter((s) => s.configPath === undefined).map((s) => s.output)
    ])
    expect(new Set(Object.keys(actionYaml.inputs ?? {}))).toEqual(
      expectedInputs
    )
  })

  it('declares exactly one output per setting in the registry', () => {
    const expectedOutputs = new Set(SETTINGS.map((s) => s.output))
    expect(new Set(Object.keys(actionYaml.outputs ?? {}))).toEqual(
      expectedOutputs
    )
  })

  it('declares a config-file default matching the source of truth', () => {
    expect(actionYaml.inputs?.['config-file']?.default).toBe(
      DEFAULT_CONFIG_FILE
    )
  })
})
