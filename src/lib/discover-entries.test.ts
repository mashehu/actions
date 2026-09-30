import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { discoverActionEntries } from './discover-entries.js'

describe('discoverActionEntries', () => {
  let fixtureDir: string

  beforeEach(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), 'discover-entries-'))
  })

  afterEach(() => {
    rmSync(fixtureDir, { recursive: true, force: true })
  })

  it('returns an empty list when the source directory does not exist', () => {
    expect(discoverActionEntries(join(fixtureDir, 'missing'))).toEqual([])
  })

  it('finds subdirectories that contain an index.ts file, sorted by name', () => {
    mkdirSync(join(fixtureDir, 'zebra'))
    writeFileSync(join(fixtureDir, 'zebra', 'index.ts'), 'export {}')

    mkdirSync(join(fixtureDir, 'apple'))
    writeFileSync(join(fixtureDir, 'apple', 'index.ts'), 'export {}')

    expect(discoverActionEntries(fixtureDir)).toEqual([
      { name: 'apple', entry: join(fixtureDir, 'apple', 'index.ts') },
      { name: 'zebra', entry: join(fixtureDir, 'zebra', 'index.ts') }
    ])
  })

  it('ignores a subdirectory without an index.ts file', () => {
    mkdirSync(join(fixtureDir, 'has-entry'))
    writeFileSync(join(fixtureDir, 'has-entry', 'index.ts'), 'export {}')

    mkdirSync(join(fixtureDir, 'no-entry'))
    writeFileSync(join(fixtureDir, 'no-entry', 'readme.md'), '')

    writeFileSync(join(fixtureDir, 'index.ts'), 'export {}') // not a subdirectory, must be ignored

    expect(discoverActionEntries(fixtureDir)).toEqual([
      { name: 'has-entry', entry: join(fixtureDir, 'has-entry', 'index.ts') }
    ])
  })
})
