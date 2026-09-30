import { describe, expect, it } from '@jest/globals'
import { isEnoent } from './is-enoent.js'

describe('isEnoent', () => {
  it('recognizes a real fs ENOENT error', () => {
    const error: NodeJS.ErrnoException = new Error('not found')
    error.code = 'ENOENT'
    expect(isEnoent(error)).toBe(true)
  })

  it('rejects an error with a different code', () => {
    const error: NodeJS.ErrnoException = new Error('denied')
    error.code = 'EACCES'
    expect(isEnoent(error)).toBe(false)
  })

  it('rejects a plain Error with no code', () => {
    expect(isEnoent(new Error('boom'))).toBe(false)
  })

  it('rejects a non-object thrown value', () => {
    expect(isEnoent('boom')).toBe(false)
    expect(isEnoent(null)).toBe(false)
    expect(isEnoent(undefined)).toBe(false)
  })

  it('accepts a plain object shaped like a Node error, not just a real Error instance', () => {
    // The cross-realm case this guards against: an error from a different
    // VM realm still has a string .code, but may not pass `instanceof Error`.
    expect(isEnoent({ code: 'ENOENT' })).toBe(true)
  })
})
