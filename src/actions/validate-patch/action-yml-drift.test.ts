import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@jest/globals'
import { parse } from 'yaml'
import { DEFAULT_MAX_SIZE_BYTES } from './args.js'

interface ActionYaml {
  inputs?: Record<string, { default?: unknown }>
}

const actionYmlPath = join(
  import.meta.dirname,
  '../../../actions/validate-patch/action.yml'
)
const actionYaml = parse(readFileSync(actionYmlPath, 'utf8')) as ActionYaml

describe('action.yml matches the code-side defaults', () => {
  it('declares a max-size-bytes default matching the source of truth', () => {
    expect(actionYaml.inputs?.['max-size-bytes']?.default).toBe(
      String(DEFAULT_MAX_SIZE_BYTES)
    )
  })
})
