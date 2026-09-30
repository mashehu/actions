import { describe, expect, it } from '@jest/globals'
import { assertPositiveInteger } from './positive-integer.js'

describe('assertPositiveInteger', () => {
  it('accepts a positive integer', () => {
    expect(() => assertPositiveInteger(5, 'max-shards')).not.toThrow()
  })

  it('rejects zero', () => {
    expect(() => assertPositiveInteger(0, 'max-shards')).toThrow(
      /positive integer/
    )
  })

  it('rejects a negative number', () => {
    expect(() => assertPositiveInteger(-1, 'max-shards')).toThrow(
      /positive integer/
    )
  })

  it('rejects a fraction', () => {
    expect(() => assertPositiveInteger(2.5, 'max-shards')).toThrow(
      /positive integer/
    )
  })

  it('rejects NaN', () => {
    expect(() => assertPositiveInteger(NaN, 'max-shards')).toThrow(
      /positive integer/
    )
  })

  it('includes the label and the value in the message', () => {
    expect(() => assertPositiveInteger(-1, 'max-shards')).toThrow(
      'max-shards must be a positive integer. Got: -1'
    )
  })
})
