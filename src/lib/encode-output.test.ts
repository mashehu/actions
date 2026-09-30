import { describe, expect, it } from '@jest/globals'
import { encodeOutput } from './encode-output.js'

describe('encodeOutput', () => {
  it('passes a string through unchanged', () => {
    expect(encodeOutput('docker')).toBe('docker')
  })

  it('encodes a number as JSON', () => {
    expect(encodeOutput(7)).toBe('7')
  })

  it('encodes a boolean as JSON', () => {
    expect(encodeOutput(true)).toBe('true')
    expect(encodeOutput(false)).toBe('false')
  })

  it('encodes a string array as JSON, for fromJSON() on the other end', () => {
    expect(encodeOutput(['docker', 'singularity'])).toBe(
      '["docker","singularity"]'
    )
  })

  it('encodes a number array as JSON', () => {
    expect(encodeOutput([1, 2, 3])).toBe('[1,2,3]')
  })

  it('encodes an empty array as JSON', () => {
    expect(encodeOutput([])).toBe('[]')
  })
})
