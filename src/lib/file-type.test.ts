import { describe, expect, it } from '@jest/globals'
import { describeType, type StatLike } from './file-type.js'

function statOf(kind: keyof StatLike): StatLike {
  const base: StatLike = {
    isSymbolicLink: () => false,
    isDirectory: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false
  }
  return { ...base, [kind]: () => true }
}

describe('describeType', () => {
  it('names a symlink', () => {
    expect(describeType(statOf('isSymbolicLink'))).toBe('a symlink')
  })

  it('names a directory', () => {
    expect(describeType(statOf('isDirectory'))).toBe('a directory')
  })

  it('names a FIFO', () => {
    expect(describeType(statOf('isFIFO'))).toBe('a FIFO')
  })

  it('names a socket', () => {
    expect(describeType(statOf('isSocket'))).toBe('a socket')
  })

  it('names a block device', () => {
    expect(describeType(statOf('isBlockDevice'))).toBe('a block device')
  })

  it('names a character device', () => {
    expect(describeType(statOf('isCharacterDevice'))).toBe('a character device')
  })

  it('falls back to a generic description when nothing matches', () => {
    expect(
      describeType({
        isSymbolicLink: () => false,
        isDirectory: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false
      })
    ).toBe('not a regular file')
  })
})
