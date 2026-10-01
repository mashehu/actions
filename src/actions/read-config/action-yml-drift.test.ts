import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@jest/globals'
import { parse } from 'yaml'
import { DEFAULT_CONFIG_FILE, METADATA } from './registry.js'

interface ActionYaml {
  inputs?: Record<string, { default?: unknown }>
  outputs?: Record<string, unknown>
}

const actionYmlPath = join(
  import.meta.dirname,
  '../../../actions/read-config/action.yml'
)
const actionYaml = parse(readFileSync(actionYmlPath, 'utf8')) as ActionYaml

describe('action.yml matches the metadata registry', () => {
  it('declares config-file as its only input', () => {
    expect(Object.keys(actionYaml.inputs ?? {})).toEqual(['config-file'])
  })

  it('declares exactly one output per registry entry', () => {
    expect(new Set(Object.keys(actionYaml.outputs ?? {}))).toEqual(
      new Set(METADATA.map((def) => def.output))
    )
  })

  it('declares a config-file default matching the source of truth', () => {
    expect(actionYaml.inputs?.['config-file']?.default).toBe(
      DEFAULT_CONFIG_FILE
    )
  })
})
