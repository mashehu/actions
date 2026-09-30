import { describe, expect, it } from '@jest/globals'
import { DEFAULT_MAX_SIZE_BYTES, parseMaxSizeBytes } from './args.js'

describe('parseMaxSizeBytes', () => {
  it('parses a positive integer', () => {
    expect(parseMaxSizeBytes('1024')).toBe(1024)
  })

  it('parses the default value', () => {
    expect(parseMaxSizeBytes(String(DEFAULT_MAX_SIZE_BYTES))).toBe(
      DEFAULT_MAX_SIZE_BYTES
    )
  })

  it('rejects zero', () => {
    expect(() => parseMaxSizeBytes('0')).toThrow(/positive integer/)
  })

  it('rejects a negative number', () => {
    expect(() => parseMaxSizeBytes('-1')).toThrow(/positive integer/)
  })

  it('rejects a non-numeric value', () => {
    expect(() => parseMaxSizeBytes('lots')).toThrow(/positive integer/)
  })
})
